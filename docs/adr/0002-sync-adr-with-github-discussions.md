# 2. Sync ADR with GitHub Discussions

Date: 2024-09-09

## Status

Accepted

## Context

Managing Architecture Decision Records (ADRs) directly in a Git repository is practical for developers who spend most of their time working with code. However, Git does not provide an easy mechanism for discussing decisions asynchronously, especially in distributed teams. Comments on ADRs are typically limited to pull request discussions, which can be disjointed from the decision-making process.

## Decision

We will use the ADR Sync to synchronize ADR documents with GitHub Discussions. This action will allow developers to create discussions for ADRs, enabling more accessible conversations, status tracking, and automatic closing of discussions based on ADR status.

## Consequences

Developers will be able to discuss ADRs within GitHub Discussions, improving collaboration.
ADR status changes will automatically reflect in the linked discussion, reducing manual overhead.
The workflow for managing ADRs will become more streamlined, with a single source of truth for both the ADR document and its related discussions.