export type UpdateDiscussionResponse = {
  updateDiscussion: {
    clientMutationId: string;
  };
};

const updateDiscussion = `
mutation UpdateDiscussion($discussionId: ID!, $body: String!) {
  updateDiscussion(input: {discussionId: $discussionId, body: $body}) {
    clientMutationId
  }
}
`;

export default updateDiscussion;
