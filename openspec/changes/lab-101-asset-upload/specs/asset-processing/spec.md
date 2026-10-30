# Asset Processing — Proposed Delta Specification

**Status:** Draft; no feature implementation authorized.

## ADDED Requirements

### Requirement: Accept safe sample assets
The system SHALL accept only supported file types and SHALL reject invalid input with a clear error.

#### Scenario: Supported asset
- **WHEN** a user uploads a supported sample file
- **THEN** the system acknowledges the asset and exposes a processing identifier

#### Scenario: Unsupported asset
- **WHEN** the uploaded asset is disallowed or exceeds configured limits
- **THEN** the system rejects it without publishing a processing event

### Requirement: Process an asset asynchronously
The system SHALL expose pending, processing, completed and failed status without relying on synchronous processing.

#### Scenario: Successful processing
- **WHEN** the worker completes processing
- **THEN** the asset status eventually becomes completed

#### Scenario: Duplicate event
- **WHEN** the same processing event is delivered repeatedly
- **THEN** duplicate external side effects are prevented

### Requirement: Observe asset status in the portal
The system SHALL display processing status and recover from temporary polling failures.

#### Scenario: Asset status displayed
- **WHEN** status updates become available
- **THEN** the portal displays the latest known state
