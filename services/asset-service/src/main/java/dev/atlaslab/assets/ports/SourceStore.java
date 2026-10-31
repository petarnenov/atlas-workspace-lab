package dev.atlaslab.assets.ports;
public interface SourceStore {
  void put(String reference,byte[] content);
  void delete(String reference);
}
