package dev.atlaslab.demo.adapters.out;
import static org.junit.jupiter.api.Assertions.*;
import dev.atlaslab.demo.*;
import java.io.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class MaintenanceFilesTest {
 @TempDir Path directory;
 MaintenanceFiles.Copy copy(String nativeJson) {
  return new MaintenanceFiles.Copy(UUID.randomUUID().toString(),UUID.randomUUID().toString(),UUID.randomUUID().toString(),UUID.randomUUID().toString(),"a".repeat(64),"alternate","plain",1,1,null,"Saved text",nativeJson,MaintenanceFiles.hash("Saved text"),MaintenanceFiles.hash(nativeJson));
 }
 @Test void privateVersionedExchangePreservesOriginalBytesAndRefusesOverwriteOrCorruption() throws Exception {
  var c=copy("{ \"native\": true }\n");var file=directory.resolve("copy.json");MaintenanceFiles.write(file,"worker-copies",List.of(c));
  assertEquals("rw-------",java.nio.file.attribute.PosixFilePermissions.toString(Files.getPosixFilePermissions(file)));
  assertEquals(c,MaintenanceFiles.copy(MaintenanceFiles.read(file,"worker-copies").get(0)));
  assertThrows(FileAlreadyExistsException.class,()->MaintenanceFiles.write(file,"worker-copies",List.of(c)));
  assertThrows(IllegalArgumentException.class,()->MaintenanceFiles.read(file,"asset-copies"));
  assertEquals(copy(null).nativeJson(),null);
  var noNative=copy(null);assertEquals(noNative,MaintenanceFiles.copy(Wire.JSON.valueToTree(noNative)));
  for(String field:List.of("markdownSha256","nativeSha256","sourceSha256","tenantId","converter","pipeline","markdown")) {
   var node=Wire.JSON.valueToTree(c);((com.fasterxml.jackson.databind.node.ObjectNode)node).put(field,Set.of("converter","pipeline").contains(field)?"":"invalid");assertThrows(Exception.class,()->MaintenanceFiles.copy(node));
  }
  for(String field:List.of("pageCount","fence")) {
   var node=Wire.JSON.valueToTree(c);((com.fasterxml.jackson.databind.node.ObjectNode)node).put(field,0);assertThrows(Exception.class,()->MaintenanceFiles.copy(node));
  }
  assertThrows(IllegalArgumentException.class,()->MaintenanceFiles.write(directory.resolve("too-many"),"x",Collections.nCopies(1001,c)));
  Files.writeString(file,"{}");assertThrows(IllegalArgumentException.class,()->MaintenanceFiles.read(file,"worker-copies"));
 }
 @Test void readDeadlineAlsoCoversStalledBodiesAfterHeaders() throws Exception {
  assertArrayEquals(new byte[]{1,2},BoundedRead.read(new ByteArrayInputStream(new byte[]{1,2}),2,Duration.ofSeconds(1)));
  assertThrows(IOException.class,()->BoundedRead.read(new ByteArrayInputStream(new byte[]{1,2,3}),2,Duration.ofSeconds(1)));
  var closed=new java.util.concurrent.atomic.AtomicBoolean();
  var stalled=new InputStream() {
   public int read() throws IOException {try {Thread.sleep(10000);return -1;}catch(InterruptedException e){throw new IOException("cancelled");}}
   public void close() {closed.set(true);}
  };
  assertThrows(java.util.concurrent.TimeoutException.class,()->BoundedRead.read(stalled,10,Duration.ofMillis(30)));assertTrue(closed.get());
 }
 @Test void processedV2EnforcesExclusiveOutcomeAndStrictVersion() throws Exception {
  var input=Wire.uploaded(UUID.randomUUID().toString(),"11111111-1111-4111-8111-111111111111",UUID.randomUUID().toString(),UUID.randomUUID()+".pdf");
  var completed=Wire.processedV2(input,UUID.randomUUID().toString(),null);
  assertEquals(completed,Wire.processedV2(Wire.json(completed)));
  var failed=Wire.processedV2(input,null,"PROCESSING_ERROR");assertEquals(failed,Wire.processedV2(Wire.json(failed)));
  var node=(com.fasterxml.jackson.databind.node.ObjectNode)Wire.JSON.valueToTree(completed);
  node.put("errorCode","PROCESSING_ERROR");assertThrows(IllegalArgumentException.class,()->Wire.processedV2(Wire.json(node)));
  node.remove("errorCode");node.put("schemaVersion",2);assertThrows(IllegalArgumentException.class,()->Wire.processedV2(Wire.json(node)));
 }
}
