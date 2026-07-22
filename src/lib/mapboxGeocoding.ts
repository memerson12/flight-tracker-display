type MapboxGeocodingUrlOptions = {
  query: string;
  accessToken: string;
  limit?: number;
  autocomplete?: boolean;
};

export const buildMapboxGeocodingUrl = ({
  query,
  accessToken,
  limit = 5,
  autocomplete = true
}: MapboxGeocodingUrlOptions) => {
  const params = new URLSearchParams({
    access_token: accessToken,
    limit: String(limit),
    autocomplete: String(autocomplete),
    types: 'address,place,postcode'
  });

  return `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json?${params.toString()}`;
};
