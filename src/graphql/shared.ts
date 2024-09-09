export type Identifiable = {
  id: string;
};

export type Discussion = {
  id: string;
  body: string;
  closed: boolean;
  labels: {
    nodes: Label[];
    pageInfo: PageInfo;
  };
};

export type Category = {
  id: string;
  name: string;
};

export type Label = {
  id: string;
  name: string;
};

export type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};
