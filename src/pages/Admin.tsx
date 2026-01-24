import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

type AdminPhoto = {
  id: string;
  url: string;
  thumb?: string;
  caption?: string;
  ord?: number;
  enabled?: boolean;
};

type SettingsResponse = {
  slideshow?: {
    interval?: number;
    shuffle?: boolean;
    fitMode?: 'cover' | 'contain';
  };
};

type ConfigResponse = {
  provider?: string;
  location?: {
    latitude: number;
    longitude: number;
    radius: number;
    name: string;
  } | null;
  area?: {
    type: 'rectangle';
    name: string;
    northwest: { latitude: number; longitude: number };
    southeast: { latitude: number; longitude: number };
  } | null;
};

type MapboxFeature = {
  id: string;
  place_name: string;
  center: [number, number];
};

type RectangleBounds = {
  north: number;
  south: number;
  west: number;
  east: number;
};

const defaultBounds: RectangleBounds = {
  north: 37.82,
  south: 37.70,
  west: -122.55,
  east: -122.35
};

const sanitizeBounds = (bounds: RectangleBounds): RectangleBounds => {
  const north = Math.max(bounds.north, bounds.south);
  const south = Math.min(bounds.north, bounds.south);
  const east = Math.max(bounds.east, bounds.west);
  const west = Math.min(bounds.east, bounds.west);
  return { north, south, east, west };
};

const boundsFromConfig = (config?: ConfigResponse | null): RectangleBounds => {
  if (config?.area?.type === 'rectangle') {
    return sanitizeBounds({
      north: config.area.northwest.latitude,
      west: config.area.northwest.longitude,
      south: config.area.southeast.latitude,
      east: config.area.southeast.longitude
    });
  }

  if (config?.location) {
    const lat = config.location.latitude;
    const lon = config.location.longitude;
    const delta = Math.max(config.location.radius / 100, 0.05);
    return sanitizeBounds({
      north: lat + delta,
      south: lat - delta,
      west: lon - delta,
      east: lon + delta
    });
  }

  return defaultBounds;
};

const boundsToPolygon = (bounds: RectangleBounds): GeoJSON.Feature<GeoJSON.Polygon> => ({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [bounds.west, bounds.north],
      [bounds.east, bounds.north],
      [bounds.east, bounds.south],
      [bounds.west, bounds.south],
      [bounds.west, bounds.north]
    ]]
  },
  properties: {}
});

const Admin = () => {
  const [token, setToken] = useState(() => localStorage.getItem('adminToken') || '');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [slideshowInterval, setSlideshowInterval] = useState(10000);
  const [slideshowShuffle, setSlideshowShuffle] = useState(true);
  const [slideshowFit, setSlideshowFit] = useState<'cover' | 'contain'>('cover');

  const [provider, setProvider] = useState('flightradar24');
  const [locationMode, setLocationMode] = useState<'circle' | 'rectangle'>('circle');
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('');
  const [nwLat, setNwLat] = useState('');
  const [nwLon, setNwLon] = useState('');
  const [seLat, setSeLat] = useState('');
  const [seLon, setSeLon] = useState('');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const rectangleLayerId = 'selection-rect';
  const rectangleFillId = 'selection-fill';
  const rectangleOutlineId = 'selection-outline';
  const cornerMarkersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const isDraggingRectRef = useRef(false);
  const dragStartRef = useRef<mapboxgl.LngLat | null>(null);
  const dragBoundsRef = useRef<RectangleBounds | null>(null);
  const dragCurrentRef = useRef<RectangleBounds | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MapboxFeature[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mapError, setMapError] = useState('');
  const [rectBounds, setRectBounds] = useState<RectangleBounds>(defaultBounds);
  const rectBoundsRef = useRef(rectBounds);
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const syncRectangleFields = (bounds: RectangleBounds) => {
    setNwLat(bounds.north.toFixed(6));
    setNwLon(bounds.west.toFixed(6));
    setSeLat(bounds.south.toFixed(6));
    setSeLon(bounds.east.toFixed(6));
  };

  const updateRectangle = (next: RectangleBounds) => {
    const sanitized = sanitizeBounds(next);
    setRectBounds(sanitized);
    syncRectangleFields(sanitized);
  };

  const updateMapGeometry = (bounds: RectangleBounds) => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource(rectangleLayerId) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(boundsToPolygon(bounds));
    }

    const corners = {
      nw: [bounds.west, bounds.north],
      ne: [bounds.east, bounds.north],
      se: [bounds.east, bounds.south],
      sw: [bounds.west, bounds.south]
    } as const;

    Object.entries(corners).forEach(([key, coords]) => {
      const marker = cornerMarkersRef.current[key];
      if (!marker) return;
      marker.setLngLat(coords as [number, number]);
    });
  };

  useEffect(() => {
    rectBoundsRef.current = rectBounds;
  }, [rectBounds]);

  const { data: photosData, refetch: refetchPhotos } = useQuery({
    queryKey: ['admin-photos', token],
    queryFn: async () => {
      const response = await fetch('/api/photos?admin=1', { headers: authHeaders });
      if (!response.ok) throw new Error('Failed to load photos');
      return response.json() as Promise<AdminPhoto[]>;
    },
    enabled: !!token
  });

  const { data: settingsData, refetch: refetchSettings } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const response = await fetch('/api/settings');
      if (!response.ok) throw new Error('Failed to load settings');
      return response.json() as Promise<SettingsResponse>;
    },
    enabled: !!token
  });

  const { data: configData, refetch: refetchConfig } = useQuery({
    queryKey: ['admin-config', token],
    queryFn: async () => {
      const response = await fetch('/api/config', { headers: authHeaders });
      if (!response.ok) throw new Error('Failed to load config');
      return response.json() as Promise<ConfigResponse>;
    },
    enabled: !!token
  });

  useEffect(() => {
    if (!settingsData?.slideshow) return;
    setSlideshowInterval(settingsData.slideshow.interval ?? 10000);
    setSlideshowShuffle(settingsData.slideshow.shuffle ?? true);
    setSlideshowFit(settingsData.slideshow.fitMode ?? 'cover');
  }, [settingsData]);

  useEffect(() => {
    if (!configData) return;
    setProvider(configData.provider || 'flightradar24');

    if (configData.area?.type === 'rectangle') {
      setLocationMode('rectangle');
      setLocationName(configData.area.name || '');
      const bounds = boundsFromConfig(configData);
      setRectBounds(bounds);
      syncRectangleFields(bounds);
    } else if (configData.location) {
      setLocationMode('circle');
      setLocationName(configData.location.name || '');
      setLatitude(String(configData.location.latitude ?? ''));
      setLongitude(String(configData.location.longitude ?? ''));
      setRadius(String(configData.location.radius ?? ''));
      const bounds = boundsFromConfig(configData);
      setRectBounds(bounds);
      syncRectangleFields(bounds);
    }
  }, [configData]);

  useEffect(() => {
    if (locationMode !== 'rectangle') return;
    if (!mapboxToken) {
      setMapError('Missing Mapbox token. Set VITE_MAPBOX_TOKEN in .env.');
      return;
    }
    setMapError('');
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [(rectBounds.east + rectBounds.west) / 2, (rectBounds.north + rectBounds.south) / 2],
      zoom: 10
    });

    mapRef.current = map;

    const initializeRectangle = () => {
      if (!map.getSource(rectangleLayerId)) {
        map.addSource(rectangleLayerId, {
          type: 'geojson',
          data: boundsToPolygon(rectBounds)
        });

        map.addLayer({
          id: rectangleFillId,
          type: 'fill',
          source: rectangleLayerId,
          paint: {
            'fill-color': '#38bdf8',
            'fill-opacity': 0.15
          }
        });

        map.addLayer({
          id: rectangleOutlineId,
          type: 'line',
          source: rectangleLayerId,
          paint: {
            'line-color': '#38bdf8',
            'line-width': 2
          }
        });
      }

      const corners = {
        nw: [rectBounds.west, rectBounds.north],
        ne: [rectBounds.east, rectBounds.north],
        se: [rectBounds.east, rectBounds.south],
        sw: [rectBounds.west, rectBounds.south]
      } as const;

      Object.entries(corners).forEach(([key, coords]) => {
        if (cornerMarkersRef.current[key]) return;
        const markerEl = document.createElement('div');
        markerEl.className = 'w-3 h-3 rounded-full bg-aviation-amber shadow-[0_0_10px_rgba(255,186,73,0.8)]';
        const marker = new mapboxgl.Marker({ element: markerEl, draggable: true })
          .setLngLat(coords as [number, number])
          .addTo(map);

        marker.on('dragend', () => {
          const { lng, lat } = marker.getLngLat();
          const next = { ...rectBoundsRef.current };
          if (key === 'nw') {
            next.north = lat;
            next.west = lng;
          }
          if (key === 'ne') {
            next.north = lat;
            next.east = lng;
          }
          if (key === 'se') {
            next.south = lat;
            next.east = lng;
          }
          if (key === 'sw') {
            next.south = lat;
            next.west = lng;
          }
          updateRectangle(next);
        });

        cornerMarkersRef.current[key] = marker;
      });

      map.fitBounds(
        [
          [rectBounds.west, rectBounds.south],
          [rectBounds.east, rectBounds.north]
        ],
        { padding: 40, animate: false }
      );
    };

    const ensureRectangleLayers = () => {
      if (!map.getSource(rectangleLayerId)) {
        initializeRectangle();
      }
    };

    map.on('load', initializeRectangle);
    map.on('styledata', ensureRectangleLayers);

    map.on('mouseenter', rectangleFillId, () => {
      map.getCanvas().style.cursor = 'move';
    });

    map.on('mouseleave', rectangleFillId, () => {
      map.getCanvas().style.cursor = '';
    });

    map.on('mousedown', rectangleFillId, (event) => {
      event.preventDefault();
      isDraggingRectRef.current = true;
      dragStartRef.current = event.lngLat;
      dragBoundsRef.current = { ...rectBoundsRef.current };
      dragCurrentRef.current = { ...rectBoundsRef.current };
    });

    map.on('mousemove', (event) => {
      if (!isDraggingRectRef.current || !dragStartRef.current || !dragBoundsRef.current) return;
      const deltaLng = event.lngLat.lng - dragStartRef.current.lng;
      const deltaLat = event.lngLat.lat - dragStartRef.current.lat;
      const next = sanitizeBounds({
        north: dragBoundsRef.current.north + deltaLat,
        south: dragBoundsRef.current.south + deltaLat,
        west: dragBoundsRef.current.west + deltaLng,
        east: dragBoundsRef.current.east + deltaLng
      });
      dragCurrentRef.current = next;
      updateMapGeometry(next);
    });

    map.on('mouseup', () => {
      if (!isDraggingRectRef.current || !dragBoundsRef.current || !dragStartRef.current) {
        isDraggingRectRef.current = false;
        dragBoundsRef.current = null;
        dragStartRef.current = null;
        return;
      }

      if (dragCurrentRef.current) {
        updateRectangle(dragCurrentRef.current);
      }

      isDraggingRectRef.current = false;
      dragBoundsRef.current = null;
      dragStartRef.current = null;
      dragCurrentRef.current = null;
    });

    return () => {
      Object.values(cornerMarkersRef.current).forEach((marker) => marker.remove());
      cornerMarkersRef.current = {};
      map.remove();
      mapRef.current = null;
    };
  }, [locationMode, mapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource(rectangleLayerId) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(boundsToPolygon(rectBounds));
    }

    const corners = {
      nw: [rectBounds.west, rectBounds.north],
      ne: [rectBounds.east, rectBounds.north],
      se: [rectBounds.east, rectBounds.south],
      sw: [rectBounds.west, rectBounds.south]
    } as const;

    Object.entries(corners).forEach(([key, coords]) => {
      const marker = cornerMarkersRef.current[key];
      if (!marker) return;
      marker.setLngLat(coords as [number, number]);
    });
  }, [rectBounds]);

  const sortedPhotos = useMemo(() => {
    const photos = photosData || [];
    return [...photos].sort((a, b) => (a.ord || 0) - (b.ord || 0));
  }, [photosData]);

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const response = await fetch('/api/config', {
        headers: { Authorization: `Bearer ${passwordInput}` }
      });

      if (!response.ok) {
        setLoginError('Invalid password');
        setLoginLoading(false);
        return;
      }

      localStorage.setItem('adminToken', passwordInput);
      setToken(passwordInput);
      setPasswordInput('');
    } catch (error) {
      setLoginError('Failed to authenticate');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setToken('');
  };

  const handleUpload = async (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const response = await fetch('/api/photos', {
      method: 'POST',
      headers: authHeaders,
      body: formData
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    await refetchPhotos();
  };

  const handleUpdatePhoto = async (id: string, patch: Record<string, unknown>) => {
    const response = await fetch(`/api/photos/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(patch)
    });

    if (!response.ok) {
      throw new Error('Failed to update photo');
    }

    await refetchPhotos();
  };

  const handleDeletePhoto = async (id: string) => {
    const response = await fetch(`/api/photos/${id}`, {
      method: 'DELETE',
      headers: authHeaders
    });

    if (!response.ok) {
      throw new Error('Failed to delete photo');
    }

    await refetchPhotos();
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedPhotos.length) return;

    const current = sortedPhotos[index];
    const target = sortedPhotos[targetIndex];

    await handleUpdatePhoto(current.id, { order: target.ord || Date.now() });
    await handleUpdatePhoto(target.id, { order: current.ord || Date.now() });
  };

  const handleSaveSettings = async () => {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        slideshow: {
          interval: Number(slideshowInterval),
          shuffle: slideshowShuffle,
          fitMode: slideshowFit
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update settings');
    }

    await refetchSettings();
  };

  const handleSaveConfig = async () => {
    const payload: ConfigResponse = {
      provider,
      location: null,
      area: null
    };

    if (locationMode === 'circle') {
      payload.location = {
        latitude: Number(latitude),
        longitude: Number(longitude),
        radius: Number(radius),
        name: locationName
      };
    } else {
      payload.area = {
        type: 'rectangle',
        name: locationName,
        northwest: {
          latitude: Number(nwLat),
          longitude: Number(nwLon)
        },
        southeast: {
          latitude: Number(seLat),
          longitude: Number(seLon)
        }
      };
    }

    const response = await fetch('/api/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Failed to update config');
    }

    await refetchConfig();
  };

  const handleSearch = async () => {
    if (!mapboxToken) {
      setMapError('Missing Mapbox token. Set VITE_MAPBOX_TOKEN in .env.');
      return;
    }

    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setMapError('');
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${mapboxToken}&limit=5`
      );
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setSearchResults(data.features || []);
    } catch (error) {
      setMapError('Failed to search address');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectSearch = (feature: MapboxFeature) => {
    const [lng, lat] = feature.center;
    setSearchResults([]);
    setSearchQuery(feature.place_name);
    setLocationName(feature.place_name);
    setMapError('');

    const map = mapRef.current;
    if (map) {
      map.flyTo({ center: [lng, lat], zoom: 11 });
    }

    updateRectangle({
      north: lat + 0.06,
      south: lat - 0.06,
      west: lng - 0.08,
      east: lng + 0.08
    });
  };

  const handleUseViewport = () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    updateRectangle({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      west: bounds.getWest(),
      east: bounds.getEast()
    });
  };

  const handleResetRectangle = () => {
    const bounds = boundsFromConfig(configData || null);
    updateRectangle(bounds);
  };

  const handleRectangleBlur = () => {
    const parsed = {
      north: Number(nwLat),
      west: Number(nwLon),
      south: Number(seLat),
      east: Number(seLon)
    };

    if ([parsed.north, parsed.south, parsed.west, parsed.east].some((value) => Number.isNaN(value))) {
      return;
    }

    updateRectangle(parsed);
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-md card-glass rounded-3xl p-8">
          <h1 className="text-3xl font-semibold mb-4">Admin Access</h1>
          <p className="text-muted-foreground mb-6">Enter the admin password to manage photos and settings.</p>
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Admin password"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
            />
            {loginError && <p className="text-sm text-aviation-red">{loginError}</p>}
            <Button onClick={handleLogin} disabled={!passwordInput || loginLoading}>
              {loginLoading ? 'Signing in...' : 'Sign in'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-semibold">Flight Frame Admin</h1>
            <p className="text-muted-foreground mt-2">Manage photos, slideshow settings, and flight area.</p>
          </div>
          <Button variant="secondary" onClick={handleLogout}>Log out</Button>
        </header>

        <section className="card-glass rounded-3xl p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Slideshow Settings</h2>
            <Button onClick={handleSaveSettings}>Save settings</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Interval (ms)</label>
              <Input
                type="number"
                value={slideshowInterval}
                onChange={(event) => setSlideshowInterval(Number(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Fit mode</label>
              <select
                value={slideshowFit}
                onChange={(event) => setSlideshowFit(event.target.value as 'cover' | 'contain')}
                className="w-full h-10 rounded-md bg-background border border-border px-3"
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Shuffle</p>
                <p className="text-lg">Randomize order</p>
              </div>
              <Switch checked={slideshowShuffle} onCheckedChange={setSlideshowShuffle} />
            </div>
          </div>
        </section>

        <section className="card-glass rounded-3xl p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Location + Provider</h2>
            <Button onClick={handleSaveConfig}>Save location</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Provider</label>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className="w-full h-10 rounded-md bg-background border border-border px-3"
              >
                <option value="flightradar24">FlightRadar24</option>
                <option value="opensky">OpenSky</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Tracking mode</label>
              <select
                value={locationMode}
                onChange={(event) => setLocationMode(event.target.value as 'circle' | 'rectangle')}
                className="w-full h-10 rounded-md bg-background border border-border px-3"
              >
                <option value="circle">Circle radius</option>
                <option value="rectangle">Rectangle bounds</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Location name</label>
              <Input value={locationName} onChange={(event) => setLocationName(event.target.value)} />
            </div>

            {locationMode === 'circle' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Latitude</label>
                  <Input value={latitude} onChange={(event) => setLatitude(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Longitude</label>
                  <Input value={longitude} onChange={(event) => setLongitude(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Radius (km)</label>
                  <Input value={radius} onChange={(event) => setRadius(event.target.value)} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">NW Latitude</label>
                      <Input
                        value={nwLat}
                        onChange={(event) => setNwLat(event.target.value)}
                        onBlur={handleRectangleBlur}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">NW Longitude</label>
                      <Input
                        value={nwLon}
                        onChange={(event) => setNwLon(event.target.value)}
                        onBlur={handleRectangleBlur}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">SE Latitude</label>
                      <Input
                        value={seLat}
                        onChange={(event) => setSeLat(event.target.value)}
                        onBlur={handleRectangleBlur}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">SE Longitude</label>
                      <Input
                        value={seLon}
                        onChange={(event) => setSeLon(event.target.value)}
                        onBlur={handleRectangleBlur}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="secondary" onClick={handleUseViewport}>Use viewport</Button>
                    <Button variant="secondary" onClick={handleResetRectangle}>Reset to saved</Button>
                  </div>
                  {mapError && <p className="text-sm text-aviation-red">{mapError}</p>}
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Search address"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleSearch();
                          }
                        }}
                      />
                      <Button onClick={handleSearch} disabled={searchLoading}>
                        {searchLoading ? 'Searching' : 'Search'}
                      </Button>
                    </div>
                    {searchResults.length > 0 && (
                      <div className="border border-border rounded-xl p-2 max-h-48 overflow-auto bg-background">
                        {searchResults.map((result) => (
                          <button
                            key={result.id}
                            onClick={() => handleSelectSearch(result)}
                            className="block w-full text-left px-2 py-1.5 rounded-lg hover:bg-secondary text-sm"
                          >
                            {result.place_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative h-80 rounded-2xl overflow-hidden border border-border/60">
                    <div ref={mapContainerRef} className="absolute inset-0" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card-glass rounded-3xl p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Photo Library</h2>
            <PhotoUpload onUpload={handleUpload} />
          </div>

          <div className="space-y-4">
            {sortedPhotos.length === 0 ? (
              <p className="text-muted-foreground">No photos uploaded yet.</p>
            ) : (
              sortedPhotos.map((photo, index) => (
                <div key={photo.id} className="flex flex-col md:flex-row gap-4 p-4 rounded-2xl border border-border/60">
                  <div className="w-full md:w-40 h-28 bg-black/40 rounded-xl overflow-hidden">
                    <img src={photo.thumb || photo.url} alt={photo.caption || 'Photo'} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={photo.enabled !== false}
                          onCheckedChange={(value) => handleUpdatePhoto(photo.id, { enabled: value })}
                        />
                        <span className="text-sm text-muted-foreground">Enabled</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => handleReorder(index, 'up')}
                          disabled={index === 0}
                        >
                          Move up
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleReorder(index, 'down')}
                          disabled={index === sortedPhotos.length - 1}
                        >
                          Move down
                        </Button>
                      </div>
                      <Button variant="destructive" onClick={() => handleDeletePhoto(photo.id)}>Delete</Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

  const PhotoUpload = ({ onUpload }: { onUpload: (files: File[]) => Promise<void> }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      await onUpload(files);
      setFiles([]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-3 md:items-center">
      <Input
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => setFiles(Array.from(event.target.files || []))}
      />
      <Button onClick={handleSubmit} disabled={files.length === 0 || uploading}>
        {uploading ? 'Uploading...' : 'Upload photos'}
      </Button>
    </div>
  );
};

export default Admin;
