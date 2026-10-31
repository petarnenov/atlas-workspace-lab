package dev.atlaslab.worker.ports;
/** Read-only compatibility capability retained until verified migration. */
public interface LegacyCopies { String read(String tenant,String assetId,String format); }
