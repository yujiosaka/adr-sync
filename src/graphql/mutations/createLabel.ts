import type { Label } from "../shared";

export type CreateLabelResponse = {
  createLabel: {
    label: Label;
  };
};

const createLabel = `
mutation CreateLabel($repositoryId: ID!, $name: String!, $color: String!, $description: String!) {
  createLabel(input: {repositoryId: $repositoryId, name: $name, color: $color, description: $description}) {
    label {
      id
      name
    }
  }
}
`;

export default createLabel;
