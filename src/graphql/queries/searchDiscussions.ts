import type { Discussion } from "../shared";

export type SearchDiscussionsResponse = {
  search: {
    nodes: Discussion[];
  };
};

const searchDiscussions = `
query SearchDiscussions($searchQuery: String!, $labelsEndCursor: String) {
  search(query: $searchQuery, type: DISCUSSION, first: 1) {
    nodes {
      ... on Discussion {
        id
        body
        closed
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
  }
}
`;

export default searchDiscussions;
