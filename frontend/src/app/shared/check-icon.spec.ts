import { iconContract } from '../../testing/icon-contract';
import { CheckIcon } from './check-icon';

describe('CheckIcon', () => {
  iconContract(CheckIcon, 13);
});
