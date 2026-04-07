export interface CorperRecord {
  stateCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  servingState: string;
  ppa?: string;
  batch: string;
  lga?: string;
}

export interface INYSCService {
  getCorperByStateCode(stateCode: string): Promise<CorperRecord>;
  isValidStateCodeFormat(stateCode: string): boolean;
}
