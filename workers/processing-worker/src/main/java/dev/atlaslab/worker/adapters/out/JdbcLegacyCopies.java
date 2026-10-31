package dev.atlaslab.worker.adapters.out;
import dev.atlaslab.worker.ports.LegacyCopies;
import org.springframework.jdbc.core.JdbcTemplate;
public final class JdbcLegacyCopies implements LegacyCopies {
  private final JdbcTemplate db;
  public JdbcLegacyCopies(JdbcTemplate db) { this.db=db; }
  public String read(String tenant,String asset,String format) {
    var rows=db.queryForList("SELECT markdown,document FROM parsed_document WHERE tenant_id=?::uuid AND asset_id=?::uuid",tenant,asset);
    return rows.isEmpty()?null:rows.getFirst().get(format.equals("markdown")?"markdown":"document").toString();
  }
}
