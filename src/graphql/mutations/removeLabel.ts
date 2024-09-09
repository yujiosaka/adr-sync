export type RemoveLabelResponse = {
  removeLabelsFromLabelable: {
    clientMutationId: string;
  };
};

const removeLabel = `
mutation RemoveLabel($discussionId: ID!, $labelId: ID!) {
  removeLabelsFromLabelable(input: {labelableId: $discussionId, labelIds: [$labelId]}) {
    clientMutationId
  }
}
`;

export default removeLabel;
