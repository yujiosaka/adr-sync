export type AddLabelResponse = {
  addLabelsToLabelable: {
    clientMutationId: string;
  };
};

const addLabel = `
mutation AddLabel($discussionId: ID!, $labelId: ID!) {
  addLabelsToLabelable(input: {labelableId: $discussionId, labelIds: [$labelId]}) {
    clientMutationId
  }
}
`;

export default addLabel;
