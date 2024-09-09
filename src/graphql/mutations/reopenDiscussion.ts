export type ReopenDiscussionResponse = {
  reopenDiscussion: {
    clientMutationId: string;
  };
};

const reopenDiscussion = `
mutation ReopenDiscussion($discussionId: ID!) {
  reopenDiscussion(input: {discussionId: $discussionId}) {
    clientMutationId
  }
}
`;

export default reopenDiscussion;
