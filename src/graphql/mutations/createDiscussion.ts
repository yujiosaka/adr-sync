import type { Identifiable } from "../shared";

export type CreateDiscussionResponse = {
  createDiscussion: {
    discussion: Identifiable;
  };
};

const createDiscussion = `
mutation CreateDiscussion($repositoryId: ID!, $title: String!, $body: String!, $categoryId: ID!) {
  createDiscussion(input: {repositoryId: $repositoryId, title: $title, body: $body, categoryId: $categoryId}) {
    discussion {
      id
    }
  }
}
`;

export default createDiscussion;
