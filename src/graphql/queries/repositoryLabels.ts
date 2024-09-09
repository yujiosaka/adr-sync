import type { Label, PageInfo } from "../shared";

export type RepositoryLabelsResponse = {
  repository: {
    id: string;
    labels: {
      nodes: Label[];
      pageInfo: PageInfo;
    };
  };
};

const repositoryLabels = `
query RepositoryLabels($repo: String!, $owner: String!, $labelsEndCursor: String) {
  repository(name: $repo, owner: $owner)  {
    id
    labels(first: 100, after: $labelsEndCursor) {
      nodes {
        id
        name
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
`;

export default repositoryLabels;
