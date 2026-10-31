package dev.atlaslab.assets.adapters.out;

import dev.atlaslab.assets.domain.AssetModel.*;
import dev.atlaslab.assets.ports.AssetPersistence;
import dev.atlaslab.demo.Wire;
import java.sql.*;
import java.util.*;
import java.util.function.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Asset-owned transactional persistence. No other component's tables are accessed. */
public final class JdbcAssets implements AssetPersistence {
  private final JdbcTemplate db;
  private final TransactionTemplate tx;
  public JdbcAssets(JdbcTemplate db,PlatformTransactionManager manager) {
    this.db=db;this.tx=new TransactionTemplate(manager);
  }
  @Override public <T> T withUploadOwnership(String scope,Supplier<T> operation) {
    try(Connection connection=db.getDataSource().getConnection()) {
      connection.setAutoCommit(true);
      advisory(connection,scope,false,false);
      try { return operation.get(); } finally { advisory(connection,scope,true,false); }
    } catch(SQLException failure) { throw new Failure(Failure.Kind.UNAVAILABLE); }
  }
  private boolean advisory(Connection connection,String scope,boolean unlock,boolean attempt) throws SQLException {
    String function=unlock?"pg_advisory_unlock":attempt?"pg_try_advisory_lock":"pg_advisory_lock";
    try(PreparedStatement statement=connection.prepareStatement("SELECT "+function+"(hashtextextended(?,0))")) {
      statement.setString(1,scope);
      try(ResultSet result=statement.executeQuery()) { return !attempt || result.next()&&result.getBoolean(1); }
    }
  }
  private Intent intent(ResultSet row,int index) throws SQLException {
    return new Intent(row.getString("asset_id"),row.getString("tenant_id"),row.getString("subject"),
      row.getString("idem_key"),row.getString("digest"),row.getString("object_key"),
      row.getString("correlation_id"),row.getString("lock_scope"),row.getBoolean("committed"));
  }
  @Override public Intent previous(Actor actor,String key) {
    var rows=db.query("SELECT * FROM upload_intent WHERE tenant_id=?::uuid AND subject=? AND idem_key=? AND expires_at>now()",
      this::intent,actor.tenant(),actor.subject(),key);
    return rows.isEmpty()?null:rows.getFirst();
  }
  @Override public Intent reserve(Intent intent) {
    tx.executeWithoutResult(status->{
      if(intent.key()!=null)db.update("UPDATE upload_intent SET idem_key=NULL WHERE tenant_id=?::uuid AND subject=? AND idem_key=? AND expires_at<=now()",
        intent.tenant(),intent.subject(),intent.key());
      db.update("INSERT INTO upload_intent(asset_id,tenant_id,subject,idem_key,digest,object_key,correlation_id,lock_scope) VALUES(?::uuid,?::uuid,?,?,?,?,?::uuid,?)",
        intent.assetId(),intent.tenant(),intent.subject(),intent.key(),intent.digest(),intent.objectKey(),intent.correlationId(),intent.lockScope());
    });
    return intent;
  }
  @Override public void commitUpload(Intent intent) {
    tx.executeWithoutResult(status->{
      db.update("INSERT INTO asset(asset_id,tenant_id,object_key,correlation_id,status) VALUES(?::uuid,?::uuid,?,?::uuid,'PENDING')",
        intent.assetId(),intent.tenant(),intent.objectKey(),intent.correlationId());
      var event=Wire.uploaded(intent.assetId(),intent.tenant(),intent.correlationId(),intent.objectKey());
      db.update("INSERT INTO upload_outbox(event_id,asset_id,payload) VALUES(?::uuid,?::uuid,?)",event.eventId(),intent.assetId(),Wire.json(event));
      db.update("UPDATE upload_intent SET committed=true WHERE asset_id=?::uuid",intent.assetId());
    });
  }
  @Override public boolean exists(String id) {
    Integer count=db.queryForObject("SELECT count(*) FROM asset WHERE asset_id=?::uuid",Integer.class,id);
    return count!=null&&count>0;
  }
  @Override public void forgetUncommitted(String id) {
    db.update("DELETE FROM upload_intent WHERE asset_id=?::uuid AND committed=false",id);
  }
  @Override public Detail read(Actor actor,String id) {
    var rows=db.query("SELECT * FROM asset WHERE tenant_id=?::uuid AND asset_id=?::uuid",
      (rs,n)->new Detail(rs.getString("asset_id"),rs.getString("status"),rs.getLong("version"),
        rs.getTimestamp("created_at").toInstant().toString(),rs.getTimestamp("updated_at").toInstant().toString(),rs.getString("error_code")),actor.tenant(),id);
    return rows.isEmpty()?null:rows.getFirst();
  }
  @Override public void applyOutcome(Outcome event,String hash,Function<State,Decision> decide) {
    tx.executeWithoutResult(status->{
      var rows=db.query("SELECT tenant_id,correlation_id,status FROM asset WHERE asset_id=?::uuid FOR UPDATE",
        (rs,n)->new State(rs.getString(1),rs.getString(2),rs.getString(3)),event.assetId());
      Decision decision=decide.apply(rows.isEmpty()?null:rows.getFirst());
      if(decision==Decision.UNKNOWN_ASSET||decision==Decision.SCOPE_MISMATCH) { finding(event.eventId(),decision.name());return; }
      if(event.inputEventId()!=null) {
        Integer bound=db.queryForObject("SELECT count(*) FROM upload_outbox WHERE event_id=?::uuid AND asset_id=?::uuid",Integer.class,event.inputEventId(),event.assetId());
        if(bound==null||bound!=1) { finding(event.eventId(),"INPUT_MISMATCH");return; }
      }
      int inserted=db.update("INSERT INTO outcome_seen VALUES(?::uuid,?) ON CONFLICT DO NOTHING",event.eventId(),hash);
      if(inserted==0) {
        if(!hash.equals(db.queryForObject("SELECT payload_hash FROM outcome_seen WHERE event_id=?::uuid",String.class,event.eventId())))finding(event.eventId(),"EVENT_ID_REUSED");
        return;
      }
      if(decision!=Decision.APPLY) { finding(event.eventId(),decision.name());return; }
      if(event.artifactId()!=null) {
        int committed=db.update("UPDATE derived_artifact SET state='COMMITTED' WHERE tenant_id=?::uuid AND asset_id=?::uuid AND artifact_id=?::uuid AND input_event_id=?::uuid AND correlation_id=?::uuid AND state='STAGED'",
          event.tenantId(),event.assetId(),event.artifactId(),event.inputEventId(),event.correlationId());
        if(committed!=1)throw new dev.atlaslab.assets.domain.ArtifactModel.Failure(dev.atlaslab.assets.domain.ArtifactModel.Failure.Kind.UNAVAILABLE);
      }
      db.update("UPDATE asset SET status=?,error_code=?,version=version+1,updated_at=now() WHERE asset_id=?::uuid",event.status(),event.errorCode(),event.assetId());
    });
  }
  @Override public void finding(String event,String reason) {
    db.update("INSERT INTO asset_finding(event_id,reason) VALUES(?::uuid,?)",event,reason);
  }
  @Override public List<String> pendingDispatches() {
    return db.query("SELECT event_id FROM upload_outbox WHERE sent=false AND attempts<3 AND next_at<=now() ORDER BY next_at LIMIT 10",(rs,n)->rs.getString(1));
  }
  @Override public Dispatch claimDispatch(String eventId) {
    tx.executeWithoutResult(status->{
      var rows=db.queryForList("SELECT * FROM upload_outbox WHERE event_id=?::uuid AND sent=false AND attempts<3 AND next_at<=now() FOR UPDATE SKIP LOCKED",eventId);
      if(!rows.isEmpty())db.update("UPDATE asset SET status='PROCESSING',version=version+1,updated_at=now() WHERE asset_id=?::uuid AND status='PENDING'",rows.getFirst().get("asset_id").toString());
    });
    return tx.execute(status->{
      var rows=db.query("UPDATE upload_outbox SET attempts=attempts+1,next_at=now()+interval '10 seconds' WHERE event_id=?::uuid AND sent=false AND attempts<3 AND next_at<=now() RETURNING event_id,asset_id,payload",
        (rs,n)->new Dispatch(rs.getString(1),rs.getString(2),rs.getString(3)),eventId);
      return rows.isEmpty()?null:rows.getFirst();
    });
  }
  @Override public void dispatched(String id) {
    db.update("UPDATE upload_outbox SET sent=true,last_error=NULL WHERE event_id=?::uuid",id);
  }
  @Override public void dispatchFailed(String id) {
    db.update("UPDATE upload_outbox SET last_error='BROKER_UNAVAILABLE',next_at=now()+((power(2,attempts-1))::text||' seconds')::interval WHERE event_id=?::uuid",id);
  }
  @Override public void expireProcessing() {
    db.update("UPDATE asset SET status='FAILED',error_code='RETRY_EXHAUSTED',version=version+1,updated_at=now() WHERE status='PROCESSING' AND updated_at<now()-interval '15 minutes'");
  }
  @Override public List<Intent> abandonedIntents() {
    return db.query("SELECT * FROM upload_intent WHERE committed=false AND created_at<now()-interval '10 minutes' LIMIT 20",this::intent);
  }
  @Override public void withAbandonedOwnership(Intent intent,Runnable operation) {
    try(Connection connection=db.getDataSource().getConnection()) {
      connection.setAutoCommit(true);
      if(!advisory(connection,intent.lockScope(),false,true))return;
      try { operation.run(); } finally { advisory(connection,intent.lockScope(),true,false); }
    } catch(SQLException failure) { throw new Failure(Failure.Kind.UNAVAILABLE); }
  }
}
