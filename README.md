# ADR Sync V1

This GitHub Action helps synchronize ADR (Architecture Decision Record) files stored in your repository with GitHub Discussions. It automates the process of managing ADRs, enabling developers to collaborate and discuss decisions more effectively using GitHub’s discussion features.

## What is an ADR?

An Architecture Decision Record (ADR) is a document that captures an architectural decision made by a software project. It provides the context, reasoning, and outcome of the decision. ADRs are essential for long-term project maintenance, ensuring future developers understand why specific decisions were made.

Here’s an example ADR:

```
# 1. Sync ADR with GitHub Discussions

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
```

To learn more about ADRs, see the following resources:

- [adr.github.io](https://adr.github.io/)
- [Michael Nygard's ADR guide](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)

## Key Features

- **Integration with ADR tools**: Works seamlessly with [adr-tools](https://github.com/npryce/adr-tools), supporting `.adr-dir` files and parsing the [default ADR template](https://github.com/npryce/adr-tools/blob/master/src/template.md).
- **Bidirectional synchronization**: Automatically syncs ADR documents in your Git repository to GitHub Discussions and vice versa, ensuring that changes made in either are reflected in the other.
- **Status management**: Automatically updates labels and manages open/close states of discussions based on the ADR status (e.g., "Proposed", "Accepted", "Superseded").
- **Link management**: Relative path links within ADR documents are adjusted to continue working in the context of GitHub Discussions.

<img width="1244" alt="364952390-dae52542-d67a-4105-9142-cd6113ee1642" src="https://github.com/user-attachments/assets/801f927a-d8a9-4697-90b8-e3e6c6345e09">

## Motivations

I love managing ADRs in a code repository. See [docs/adr](https://github.com/yujiosaka/adr-sync/tree/main/docs/adr) for example.

Developers spend most of their time with code, so it's the most natural place to maintain ADRs. With ADR Sync, you can synchronize your ADRs with GitHub Discussions and easily track changes and discussions, all while keeping the ADR and the actual change in the same commit.

Often, teams face challenges in discussing ADRs when they're locked away in version control. This action solves that problem by creating GitHub Discussions for your ADRs, allowing team members to leave comments, add labels, and participate in conversations without navigating away from GitHub.

With ADR Sync, you can automatically:

- Start a discussion for a "Proposed" status.
- Transition the discussion to "Accepted" and close it when the ADR status changes.
- Track decisions in a more collaborative environment.
- Synchronize discussions back into the Git repository, ensuring that ADR files and discussions stay aligned.

## Inputs

Here are the configurable inputs for this action:

| Input                 | Description                                                                                                             | Default                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `branch`              | The branch to synchronize discussions with.                                                                             | `main`                                                |
| `discussion-category` | The category to submit GitHub Discussions.                                                                              | `General`                                             |
| `title-regex`         | Regular expression to match ADR discussion titles.                                                                      | `^\d{4}-[^.]*\.md$`                                   |
| `status-regex`        | Regular expression to extract the status from ADR content. This is customizable to match different ADR templates.       | `##\s*Status\s+([^\s\n]+?)(?:\s+by\s.*)?\s*(?:\n\|$)` |
| `close-statuses`      | A list of statuses (comma-separated) that will cause the associated GitHub Discussion to close automatically.           | `Accepted, Superseded, Deprecated, Rejected`          |
| `github-token`        | The GitHub token needed to authorize actions in the repository. This should be passed as `${{ secrets.GITHUB_TOKEN }}`. | N/A                                                   |

## Configuring the ADR Directory

If your ADRs are located in a custom directory, you can define this in a `.adr-dir` file in the repository root. The action will automatically read this file to locate your ADRs. By default, it expects the ADRs to be in `doc/adr`, but you can adjust this by creating a `.adr-dir` file and specifying the directory.

## Necessary Permissions for the GitHub Token

To use [ADR Sync](https://github.com/yujiosaka/adr-sync), you need to provide a GitHub fine-grained token with the following permissions:

- **Discussions**: Read and write permissions to create, update, and close discussions.
- **Issues and pull requests**: Read and write permissions are required to manage labels.
- **Repository contents**: Read and write permissions are required to fetch and update ADR content.

<img width="782" alt="Screenshot 2024-09-09 at 3 47 41" src="https://github.com/user-attachments/assets/f5658bfd-7545-4234-914a-2ce9f9cdbb8e">

### Steps to Generate a GitHub Token

1. Go to [GitHub's Personal Access Tokens page](https://github.com/settings/tokens?type=beta).
2. Click "Generate new token".
3. Enter name and expiration, and set the following repository permissions:
   - **Discussions**: Read & write
   - **Issues (or Pull requests)**: Read & write
   - **Contents**: Read & write
4. Copy the token and add it as an action secret in your repository (e.g., `GH_TOKEN`).

<img width="1114" alt="364952751-8d07137d-ab8f-420a-805f-76d11d11bd57" src="https://github.com/user-attachments/assets/3d9560a7-ed04-422b-a3cd-d83d1a70ed0f">

## Usage Example

Here’s how you can use [ADR Sync](https://github.com/yujiosaka/adr-sync) in your workflow:

```yaml
name: Synchronize ADR

on:
  push:
    branches:
      - main
  discussion:
    types: [created, edited]

jobs:
  sync-adr:
    runs-on: ubuntu-latest

    steps:
      - name: Run ADR Sync Action
        uses: yujiosaka/adr-sync@v1
        with:
          github-token: ${{ secrets.GH_TOKEN }}
```

By using this setup, every time you push to the `main` branch or create/edit a discussion, the action will automatically synchronize ADRs in your repository with GitHub Discussions and ensure discussions are synced back to the ADR directory in Git.

With [ADR Sync](https://github.com/yujiosaka/adr-sync), you can close the gap between ADRs stored in Git and ongoing team discussions on GitHub. Discussions can be automatically opened, closed, and labeled based on the ADR status, and changes to discussions will be reflected in your repository's ADR files, ensuring consistency across both platforms.
