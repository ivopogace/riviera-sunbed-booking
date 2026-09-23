import { iconContract } from '../../testing/icon-contract';
import { PartyIcon } from './party-icon';

describe('PartyIcon', () => {
  iconContract(PartyIcon, 13);
});
