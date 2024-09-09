export type AddDiscussionCommentResponse = {
  addDiscussionComment: {
    clientMutationId: string;
  };
};

const addDiscussionComment = `
mutation AddDiscussionComment($discussionId: ID!, $body: String!) {
  addDiscussionComment(input: {discussionId: $discussionId, body: $body}) {
    clientMutationId
  }
}
`;

export default addDiscussionComment;
