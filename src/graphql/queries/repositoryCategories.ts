import type { Category, PageInfo } from "../shared";

export type RepositoryCategoriesResponse = {
  repository: {
    id: string;
    discussionCategories: {
      nodes: Category[];
      pageInfo: PageInfo;
    };
  };
};

const repositoryCategories = `
query RepositoryCategories($repo: String!, $owner: String!, $categoriesEndCursor: String) {
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
  }
}
`;

export default repositoryCategories;
