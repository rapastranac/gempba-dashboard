/**
 * The wire protocol: immutable record DTOs mirroring gempba's telemetry JSON,
 * plus the Jackson {@code JsonMapper} that parses them. These types model the
 * transport, not the domain — they are confined to the {@code adapters} module
 * and never cross into {@code ui}; the {@code WorldSnapshotMapper} translates them
 * into the domain read-model at the boundary.
 */
package io.gempba.dashboard.protocol;
