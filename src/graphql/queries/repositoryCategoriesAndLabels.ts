import type { Category, Label, PageInfo } from "../shared";

export type RepositoryCategoriesAndLabelsResponse = {
  repository: {
    id: string;
    discussionCategories: {
      nodes: Category[];
      pageInfo: PageInfo;
    };
    labels: {
      nodes: Label[];
      pageInfo: PageInfo;
    };
  };
};

const repositoryCategoriesAndLabels = `
query RepositoryCategoriesAndLabels($repo: String!, $owner: String!, $categoriesEndCursor: String, $labelsEndCursor: String) {
  repository(name: $repo, owner: $owner)  {
    id
    discussionCategories(first: 100, after: $categoriesEndCursor) {
      nodes {
        id
        name
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
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

export default repositoryCategoriesAndLabels;
