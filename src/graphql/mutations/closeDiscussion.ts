export type CloseDiscussionResponse = {
  closeDiscussion: {
    clientMutationId: string;
  };
};

const closeDiscussion = `
mutation CloseDiscussion($discussionId: ID!) {
  closeDiscussion(input: {discussionId: $discussionId}) {
    clientMutationId
  }
}
`;

export default closeDiscussion;
