import { directionsUrl } from './directions-url';

describe('directionsUrl', () => {
  it('names the pin as the destination of a plain Maps URL', () => {
    expect(directionsUrl({ latitude: 39.774531, longitude: 19.998412 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=39.774531,19.998412',
    );
  });

  it('keeps a negative coordinate signed', () => {
    expect(directionsUrl({ latitude: -1.5, longitude: -0.25 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-1.5,-0.25',
    );
  });
});
