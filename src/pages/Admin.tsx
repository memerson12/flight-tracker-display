import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import { buildMapboxGeocodingUrl } from '@/lib/mapboxGeocoding';
import {
  formatPhotoUploadSize,
  getPhotoSizeError,
  type PhotoUploadStatus,
  type PhotoUploadStatusListener,
  uploadPhotoFiles
} from '@/lib/photoUpload';
import { inferTimeZone, isValidTimeZone, resolveTimeZone } from '@/lib/timeSettings';
import { SettingsResponse } from '@/types/settings';

type AdminPhoto = {
  id: string;
  url: string;
  thumb?: string;
  location?: string;
  ord?: number;
  enabled?: boolean;
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

const commonTimeZones = [
  'Australia/Brisbane',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Adelaide',
  'Australia/Perth',
  'Pacific/Auckland',
  'UTC'
];

const getResponseError = async (response: Response, fallback: string) => {
  try {
    const body = await response.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
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

const createViewerMarker = (map: mapboxgl.Map, coordinates: [number, number]) => {
  const markerElement = document.createElement('div');
  markerElement.className = 'relative flex h-7 w-7 items-center justify-center';
  markerElement.title = 'Viewer location';
  markerElement.setAttribute('aria-label', 'Viewer location');

  const halo = document.createElement('div');
  halo.className = 'absolute inset-0 rounded-full bg-aviation-amber/25 ring-2 ring-aviation-amber/50';
  const dot = document.createElement('div');
  dot.className = 'relative h-3 w-3 rounded-full bg-aviation-amber border-2 border-background shadow-[0_0_12px_rgba(255,186,73,0.95)]';
  markerElement.append(halo, dot);

  return new mapboxgl.Marker({ element: markerElement })
    .setLngLat(coordinates)
    .addTo(map);
};

const fitMapToTrackingArea = (
  map: mapboxgl.Map,
  bounds: RectangleBounds,
  viewerCoordinates: [number, number] | null,
  animate = false
) => {
  const mapBounds = new mapboxgl.LngLatBounds(
    [bounds.west, bounds.south],
    [bounds.east, bounds.north]
  );
  if (viewerCoordinates) mapBounds.extend(viewerCoordinates);
  map.fitBounds(mapBounds, { padding: 50, animate, duration: animate ? 700 : 0 });
};

const Admin = () => {
  const [token, setToken] = useState(() => localStorage.getItem('adminToken') || '');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [slideshowInterval, setSlideshowInterval] = useState(10000);
  const [slideshowShuffle, setSlideshowShuffle] = useState(true);
  const [slideshowFit, setSlideshowFit] = useState<'cover' | 'contain'>('cover');
  const [clockUse24Hour, setClockUse24Hour] = useState(true);
  const [clockTimeZone, setClockTimeZone] = useState('');
  const [displayBrightness, setDisplayBrightness] = useState(100);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('07:00');
  const [quietHoursBrightness, setQuietHoursBrightness] = useState(0);
  const [windowPositionEnabled, setWindowPositionEnabled] = useState(false);
  const [observerAddress, setObserverAddress] = useState('');
  const [observerLatitude, setObserverLatitude] = useState('');
  const [observerLongitude, setObserverLongitude] = useState('');
  const [windowBearing, setWindowBearing] = useState('90');
  const [windowViewAngle, setWindowViewAngle] = useState('90');
  const [observerStatus, setObserverStatus] = useState('');
  const [observerSuggestions, setObserverSuggestions] = useState<MapboxFeature[]>([]);
  const [observerSearching, setObserverSearching] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [settingsMessageIsError, setSettingsMessageIsError] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [locationSetupMessage, setLocationSetupMessage] = useState('');
  const [locationSetupMessageIsError, setLocationSetupMessageIsError] = useState(false);
  const [locationSetupSaving, setLocationSetupSaving] = useState(false);
  const [photoActionId, setPhotoActionId] = useState<string | null>(null);

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
  const viewerMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const viewerCoordinatesRef = useRef<[number, number] | null>(null);
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
  const [trackingSearchResolved, setTrackingSearchResolved] = useState(false);
  const [trackingSearchStatus, setTrackingSearchStatus] = useState('');
  const [mapError, setMapError] = useState('');
  const [rectBounds, setRectBounds] = useState<RectangleBounds>(defaultBounds);
  const rectBoundsRef = useRef(rectBounds);
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

  const parsedObserverLatitude = Number(observerLatitude);
  const parsedObserverLongitude = Number(observerLongitude);
  viewerCoordinatesRef.current = observerLatitude !== ''
    && observerLongitude !== ''
    && Number.isFinite(parsedObserverLatitude)
    && Number.isFinite(parsedObserverLongitude)
    ? [parsedObserverLongitude, parsedObserverLatitude]
    : null;

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
    if (settingsData?.slideshow) {
      setSlideshowInterval(settingsData.slideshow.interval ?? 10000);
      setSlideshowShuffle(settingsData.slideshow.shuffle ?? true);
      setSlideshowFit(settingsData.slideshow.fitMode ?? 'cover');
    }

    if (settingsData?.windowPosition) {
      setWindowPositionEnabled(settingsData.windowPosition.enabled ?? false);
      setObserverAddress(settingsData.windowPosition.address ?? '');
      setObserverLatitude(settingsData.windowPosition.latitude == null ? '' : String(settingsData.windowPosition.latitude));
      setObserverLongitude(settingsData.windowPosition.longitude == null ? '' : String(settingsData.windowPosition.longitude));
      setWindowBearing(String(settingsData.windowPosition.bearing ?? 90));
      setWindowViewAngle(String(settingsData.windowPosition.viewAngle ?? 90));
    }

    setClockUse24Hour(settingsData?.clock?.use24Hour ?? true);
    setClockTimeZone(resolveTimeZone(
      settingsData?.clock?.timeZone,
      settingsData?.windowPosition?.latitude,
      settingsData?.windowPosition?.longitude
    ));
    setDisplayBrightness(settingsData?.display?.brightness ?? 100);
    setQuietHoursEnabled(settingsData?.display?.quietHours?.enabled ?? false);
    setQuietHoursStart(settingsData?.display?.quietHours?.start ?? '22:00');
    setQuietHoursEnd(settingsData?.display?.quietHours?.end ?? '07:00');
    setQuietHoursBrightness(settingsData?.display?.quietHours?.brightness ?? 0);
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
    const query = observerAddress.trim();
    if (query.length < 3 || observerLatitude || observerLongitude) {
      setObserverSuggestions([]);
      setObserverSearching(false);
      return;
    }
    if (!mapboxToken) {
      setObserverSuggestions([]);
      setObserverSearching(false);
      setObserverStatus('Missing Mapbox token. Address search is unavailable.');
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setObserverSearching(true);
      try {
        const response = await fetch(buildMapboxGeocodingUrl({
          query,
          accessToken: mapboxToken
        }), { signal: controller.signal });
        if (!response.ok) throw new Error('Address search failed');
        const data = await response.json();
        const features = (data.features || []) as MapboxFeature[];
        setObserverSuggestions(features);
        setObserverStatus(features.length === 0 ? 'No matching addresses found.' : '');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setObserverSuggestions([]);
        setObserverStatus('Failed to search addresses.');
      } finally {
        if (!controller.signal.aborted) setObserverSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [mapboxToken, observerAddress, observerLatitude, observerLongitude]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (locationMode !== 'rectangle' || trackingSearchResolved || query.length < 3) {
      setSearchResults([]);
      if (query.length < 3) setTrackingSearchStatus('');
      return;
    }
    if (!mapboxToken) {
      setSearchResults([]);
      setTrackingSearchStatus('Missing Mapbox token. Address search is unavailable.');
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setTrackingSearchStatus('Searching addresses…');
      try {
        const response = await fetch(buildMapboxGeocodingUrl({
          query,
          accessToken: mapboxToken
        }), { signal: controller.signal });
        if (!response.ok) throw new Error('Address search failed');
        const data = await response.json();
        const features = (data.features || []) as MapboxFeature[];
        setSearchResults(features);
        setTrackingSearchStatus(features.length === 0 ? 'No matching addresses found.' : '');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSearchResults([]);
        setTrackingSearchStatus('Failed to search addresses.');
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [locationMode, mapboxToken, searchQuery, trackingSearchResolved]);

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

      const viewerCoordinates = viewerCoordinatesRef.current;
      if (viewerCoordinates && !viewerMarkerRef.current) {
        viewerMarkerRef.current = createViewerMarker(map, viewerCoordinates);
      }
      fitMapToTrackingArea(map, rectBounds, viewerCoordinates);
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
      viewerMarkerRef.current?.remove();
      viewerMarkerRef.current = null;
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const viewerCoordinates = viewerCoordinatesRef.current;
    if (!viewerCoordinates) {
      viewerMarkerRef.current?.remove();
      viewerMarkerRef.current = null;
      return;
    }

    if (!viewerMarkerRef.current) {
      viewerMarkerRef.current = createViewerMarker(map, viewerCoordinates);
    } else {
      viewerMarkerRef.current.setLngLat(viewerCoordinates);
    }
    fitMapToTrackingArea(map, rectBoundsRef.current, viewerCoordinates, true);
  }, [observerLatitude, observerLongitude]);

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

  const handleUpload = async (files: File[], onStatus: PhotoUploadStatusListener) => {
    try {
      const sizeError = getPhotoSizeError(files);
      if (sizeError) throw new Error(sizeError);

      await uploadPhotoFiles(files, token, onStatus);
      onStatus({ stage: 'refreshing', progress: 100 });
      await refetchPhotos();
      toast.success(`${files.length} photo${files.length === 1 ? '' : 's'} uploaded.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      toast.error(message);
      throw error;
    }
  };

  const updatePhoto = async (id: string, patch: Record<string, unknown>) => {
    const response = await fetch(`/api/photos/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(patch)
    });

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Failed to update photo'));
    }
  };

  const handleUpdatePhoto = async (id: string, patch: Record<string, unknown>, successMessage = 'Photo updated.') => {
    setPhotoActionId(id);
    try {
      await updatePhoto(id, patch);
      await refetchPhotos();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update photo');
    } finally {
      setPhotoActionId(null);
    }
  };

  const handleDeletePhoto = async (id: string) => {
    setPhotoActionId(id);
    try {
      const response = await fetch(`/api/photos/${id}`, {
        method: 'DELETE',
        headers: authHeaders
      });

      if (!response.ok) {
        throw new Error(await getResponseError(response, 'Failed to delete photo'));
      }

      await refetchPhotos();
      toast.success('Photo deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete photo');
    } finally {
      setPhotoActionId(null);
    }
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedPhotos.length) return;

    const current = sortedPhotos[index];
    const target = sortedPhotos[targetIndex];

    setPhotoActionId(current.id);
    try {
      await updatePhoto(current.id, { order: target.ord || Date.now() });
      await updatePhoto(target.id, { order: current.ord || Date.now() });
      await refetchPhotos();
      toast.success(direction === 'up' ? 'Photo moved up.' : 'Photo moved down.');
    } catch (error) {
      await refetchPhotos();
      toast.error(error instanceof Error ? error.message : 'Failed to reorder photos');
    } finally {
      setPhotoActionId(null);
    }
  };

  const getDisplaySettingsValidationError = () => {
    if (!isValidTimeZone(clockTimeZone)) {
      return 'Enter a valid IANA time zone, such as Australia/Brisbane.';
    }
    if (quietHoursEnabled && quietHoursStart === quietHoursEnd) {
      return 'Quiet hours must have different start and end times.';
    }
    return null;
  };

  const getWindowPositionValidationError = () => {
    const parsedLatitude = Number(observerLatitude);
    const parsedLongitude = Number(observerLongitude);
    if (
      windowPositionEnabled
      && (
        observerLatitude === ''
        || observerLongitude === ''
        || !Number.isFinite(parsedLatitude)
        || !Number.isFinite(parsedLongitude)
      )
    ) {
      return 'Resolve the viewer address before enabling the position indicator.';
    }
    const parsedBearing = Number(windowBearing);
    if (!Number.isFinite(parsedBearing) || parsedBearing < 0 || parsedBearing > 359) {
      return 'Looking direction must be between 0° and 359°.';
    }
    const parsedViewAngle = Number(windowViewAngle);
    if (!Number.isFinite(parsedViewAngle) || parsedViewAngle < 10 || parsedViewAngle > 180) {
      return 'Window view must be between 10° and 180°.';
    }
    return null;
  };

  const saveDisplaySettings = async () => {
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
        },
        clock: {
          use24Hour: clockUse24Hour,
          timeZone: clockTimeZone
        },
        display: {
          brightness: displayBrightness,
          quietHours: {
            enabled: quietHoursEnabled,
            start: quietHoursStart,
            end: quietHoursEnd,
            brightness: quietHoursBrightness
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Failed to update display settings'));
    }

    await refetchSettings();
  };

  const saveWindowPositionSettings = async () => {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        windowPosition: {
          enabled: windowPositionEnabled,
          address: observerAddress.trim(),
          latitude: observerLatitude === '' ? null : Number(observerLatitude),
          longitude: observerLongitude === '' ? null : Number(observerLongitude),
          bearing: Number(windowBearing),
          viewAngle: Number(windowViewAngle)
        }
      })
    });

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Failed to update the viewer position'));
    }

    await refetchSettings();
  };

  const handleSaveSettings = async () => {
    const validationError = getDisplaySettingsValidationError();
    if (validationError) {
      setSettingsMessage(validationError);
      setSettingsMessageIsError(true);
      toast.error(validationError);
      return;
    }

    setSettingsMessage('Saving...');
    setSettingsMessageIsError(false);
    setSettingsSaving(true);
    try {
      await saveDisplaySettings();
      setSettingsMessage('Display settings saved.');
      toast.success('Display settings saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update display settings';
      setSettingsMessage(message);
      setSettingsMessageIsError(true);
      toast.error(message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSelectObserverAddress = (feature: MapboxFeature) => {
    const [longitude, latitude] = feature.center;
    const inferredTimeZone = inferTimeZone(latitude, longitude);
    setObserverAddress(feature.place_name);
    setObserverLatitude(String(latitude));
    setObserverLongitude(String(longitude));
    setObserverSuggestions([]);
    if (inferredTimeZone) setClockTimeZone(inferredTimeZone);
    setObserverStatus(
      `Selected ${latitude.toFixed(6)}, ${longitude.toFixed(6)}${inferredTimeZone ? ` · ${inferredTimeZone}` : ''}. Save the location setup to apply it.`
    );
  };

  const getTrackingConfigValidationError = () => {
    const coordinateValues = locationMode === 'circle'
      ? [latitude, longitude, radius]
      : [nwLat, nwLon, seLat, seLon];
    if (coordinateValues.some((value) => value.trim() === '' || !Number.isFinite(Number(value)))) {
      return 'Enter valid numeric coordinates before saving.';
    }
    if (locationMode === 'circle' && Number(radius) <= 0) {
      return 'Radius must be greater than zero.';
    }
    return null;
  };

  const buildTrackingConfigPayload = (): ConfigResponse => {
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
    return payload;
  };

  const saveTrackingConfig = async () => {
    const response = await fetch('/api/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(buildTrackingConfigPayload())
    });

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Failed to update location and provider'));
    }

    await refetchConfig();
  };

  const handleSaveLocationSetup = async () => {
    const validationError = getWindowPositionValidationError() || getTrackingConfigValidationError();
    if (validationError) {
      setLocationSetupMessage(validationError);
      setLocationSetupMessageIsError(true);
      toast.error(validationError);
      return;
    }

    setLocationSetupSaving(true);
    setLocationSetupMessage('Saving viewer and tracking area...');
    setLocationSetupMessageIsError(false);
    try {
      // Both endpoints persist the same config file, so these writes must remain sequential.
      await saveWindowPositionSettings();
      await saveTrackingConfig();
      setLocationSetupMessage('Location setup saved. Flight tracking is using the new area.');
      toast.success('Location setup saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save the location setup';
      setLocationSetupMessage(message);
      setLocationSetupMessageIsError(true);
      toast.error(message);
    } finally {
      setLocationSetupSaving(false);
    }
  };

  const handleSelectSearch = (feature: MapboxFeature) => {
    const [lng, lat] = feature.center;
    setSearchResults([]);
    setSearchQuery(feature.place_name);
    setTrackingSearchResolved(true);
    setTrackingSearchStatus('Address selected. Adjust the bounds if needed, then save the location setup.');
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Display Settings</h2>
              <p className="text-muted-foreground mt-1">Control brightness, quiet hours, photos, and the clock.</p>
            </div>
            <Button
              className="w-full sm:w-auto"
              onClick={handleSaveSettings}
              disabled={settingsSaving || locationSetupSaving}
            >
              {settingsSaving ? 'Saving...' : 'Save settings'}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border/60 bg-background/35 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Normal brightness</p>
                  <p className="text-sm text-muted-foreground">Used outside quiet hours</p>
                </div>
                <output className="min-w-12 text-right font-mono text-sm text-primary">
                  {displayBrightness === 0 ? 'Off' : `${displayBrightness}%`}
                </output>
              </div>
              <Slider
                aria-label="Normal brightness"
                min={0}
                max={100}
                step={5}
                value={[displayBrightness]}
                onValueChange={([value]) => setDisplayBrightness(value)}
              />
            </div>

            <div className="space-y-4 rounded-xl border border-border/60 bg-background/35 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Quiet hours</p>
                  <p className="text-sm text-muted-foreground">Automatically dim the OLED on a daily schedule</p>
                </div>
                <Switch
                  aria-label="Enable quiet hours"
                  checked={quietHoursEnabled}
                  onCheckedChange={setQuietHoursEnabled}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-muted-foreground">
                  Starts
                  <Input
                    type="time"
                    value={quietHoursStart}
                    disabled={!quietHoursEnabled}
                    onChange={(event) => setQuietHoursStart(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-muted-foreground">
                  Ends
                  <Input
                    type="time"
                    value={quietHoursEnd}
                    disabled={!quietHoursEnabled}
                    onChange={(event) => setQuietHoursEnd(event.target.value)}
                  />
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">Quiet-hours brightness</span>
                  <output className="min-w-12 text-right font-mono text-primary">
                    {quietHoursBrightness === 0 ? 'Off' : `${quietHoursBrightness}%`}
                  </output>
                </div>
                <Slider
                  aria-label="Quiet-hours brightness"
                  min={0}
                  max={100}
                  step={5}
                  value={[quietHoursBrightness]}
                  disabled={!quietHoursEnabled}
                  onValueChange={([value]) => setQuietHoursBrightness(value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Uses the display time zone below. Off renders true black on the OLED.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-border/60 pt-6">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Photo interval (ms)</label>
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

          <div className="grid grid-cols-1 md:grid-cols-[0.7fr_1.3fr] gap-6 border-t border-border/60 pt-6">
            <fieldset className="space-y-2">
              <legend className="text-sm text-muted-foreground">Clock format</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Clock format">
                <label
                  className={`flex min-h-14 cursor-pointer flex-col justify-center rounded-md border px-4 transition-colors ${
                    !clockUse24Hour
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-accent'
                  }`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="clock-format"
                    value="12"
                    checked={!clockUse24Hour}
                    onChange={() => setClockUse24Hour(false)}
                  />
                  <span className="font-medium">12-hour</span>
                  <span className={`text-xs ${!clockUse24Hour ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>
                    10:05 pm
                  </span>
                </label>
                <label
                  className={`flex min-h-14 cursor-pointer flex-col justify-center rounded-md border px-4 transition-colors ${
                    clockUse24Hour
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-accent'
                  }`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="clock-format"
                    value="24"
                    checked={clockUse24Hour}
                    onChange={() => setClockUse24Hour(true)}
                  />
                  <span className="font-medium">24-hour</span>
                  <span className={`text-xs ${clockUse24Hour ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>
                    22:05
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Display time zone</label>
              <div className="flex gap-2">
                <Input
                  list="display-time-zones"
                  value={clockTimeZone}
                  placeholder="Australia/Brisbane"
                  onChange={(event) => setClockTimeZone(event.target.value)}
                />
                <datalist id="display-time-zones">
                  {commonTimeZones.map((timeZone) => <option key={timeZone} value={timeZone} />)}
                </datalist>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const inferred = observerLatitude && observerLongitude
                      ? inferTimeZone(Number(observerLatitude), Number(observerLongitude))
                      : '';
                    if (inferred) {
                      setClockTimeZone(inferred);
                      setSettingsMessage(`Time zone set from viewer location: ${inferred}`);
                      setSettingsMessageIsError(false);
                      toast.success(`Time zone changed to ${inferred}. Save settings to apply it.`);
                    } else {
                      setSettingsMessage('Resolve the viewer address before detecting its time zone.');
                      setSettingsMessageIsError(true);
                      toast.error('Resolve the viewer address first.');
                    }
                  }}
                >
                  From viewer
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Uses an IANA time zone. Resolving the viewer address updates this automatically.
              </p>
            </div>
          </div>

          {settingsMessage && (
            <p className={`text-sm ${settingsMessageIsError ? 'text-aviation-red' : 'text-primary'}`} role="status">
              {settingsMessage}
            </p>
          )}
        </section>

        <section className="card-glass rounded-3xl p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Location + Display Position</h2>
              <p className="text-muted-foreground mt-1">Configure the tracked airspace and where the viewer sits relative to it.</p>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center justify-between gap-3 sm:justify-start">
                <span className="text-sm text-muted-foreground">Show on flight screen</span>
                <Switch
                  aria-label="Show window position indicator"
                  checked={windowPositionEnabled}
                  onCheckedChange={setWindowPositionEnabled}
                />
              </div>
              <Button
                className="w-full whitespace-nowrap sm:w-auto"
                onClick={handleSaveLocationSetup}
                disabled={locationSetupSaving || settingsSaving}
              >
                {locationSetupSaving ? 'Saving setup...' : 'Save location setup'}
              </Button>
            </div>
          </div>

          {locationSetupMessage && (
            <p className={`text-sm ${locationSetupMessageIsError ? 'text-aviation-red' : 'text-primary'}`} role="status">
              {locationSetupMessage}
            </p>
          )}

          <div>
            <h3 className="text-lg font-medium">Viewer + Window Position</h3>
            <p className="text-sm text-muted-foreground mt-1">The amber dot on the map previews the viewer location.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.6fr] gap-6">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Viewer address</label>
              <Input
                value={observerAddress}
                placeholder="Start typing an address"
                aria-label="Viewer address"
                aria-autocomplete="list"
                aria-controls={observerSuggestions.length > 0 ? 'viewer-address-suggestions' : undefined}
                onChange={(event) => {
                  setObserverAddress(event.target.value);
                  setObserverLatitude('');
                  setObserverLongitude('');
                  setObserverStatus('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && observerSuggestions.length > 0) {
                    event.preventDefault();
                    handleSelectObserverAddress(observerSuggestions[0]);
                  } else if (event.key === 'Escape') {
                    setObserverSuggestions([]);
                  }
                }}
              />
              {observerSuggestions.length > 0 && (
                <div
                  id="viewer-address-suggestions"
                  className="border border-border rounded-xl p-2 max-h-48 overflow-auto bg-background"
                  role="listbox"
                  aria-label="Viewer address suggestions"
                >
                  {observerSuggestions.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      role="option"
                      aria-selected="false"
                      onClick={() => handleSelectObserverAddress(result)}
                      className="block w-full text-left px-2 py-1.5 rounded-lg hover:bg-secondary text-sm"
                    >
                      {result.place_name}
                    </button>
                  ))}
                </div>
              )}
              <p
                className={`text-xs ${observerStatus.startsWith('Failed') || observerStatus.startsWith('Missing') ? 'text-aviation-red' : 'text-muted-foreground'}`}
                role="status"
              >
                {observerSearching ? 'Searching addresses…' : observerStatus || (observerLatitude && observerLongitude
                  ? `Saved coordinates: ${observerLatitude}, ${observerLongitude}`
                  : observerSuggestions.length > 0
                    ? 'Choose a matching address below.'
                    : 'Type at least 3 characters, then choose a matching address.')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Looking direction (°)</label>
                <Input
                  type="number"
                  min="0"
                  max="359"
                  value={windowBearing}
                  onChange={(event) => setWindowBearing(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">90° is east</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Window view (°)</label>
                <Input
                  type="number"
                  min="10"
                  max="180"
                  value={windowViewAngle}
                  onChange={(event) => setWindowViewAngle(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">90° spans NE to SE</p>
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 pt-6 space-y-6">
            <div>
              <h3 className="text-lg font-medium">Flight Tracking Area</h3>
              <p className="text-sm text-muted-foreground mt-1">Choose the provider and the airspace shown on the display.</p>
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
                  <div className="flex flex-col gap-2">
                    <Input
                      placeholder="Start typing an address"
                      aria-label="Tracking area address"
                      aria-autocomplete="list"
                      aria-controls={searchResults.length > 0 ? 'tracking-address-suggestions' : undefined}
                      value={searchQuery}
                      onChange={(event) => {
                        setSearchQuery(event.target.value);
                        setTrackingSearchResolved(false);
                        setTrackingSearchStatus('');
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && searchResults.length > 0) {
                          event.preventDefault();
                          handleSelectSearch(searchResults[0]);
                        } else if (event.key === 'Escape') {
                          setSearchResults([]);
                        }
                      }}
                    />
                    {searchResults.length > 0 && (
                      <div
                        id="tracking-address-suggestions"
                        className="border border-border rounded-xl p-2 max-h-48 overflow-auto bg-background"
                        role="listbox"
                        aria-label="Tracking area address suggestions"
                      >
                        {searchResults.map((result) => (
                          <button
                            key={result.id}
                            type="button"
                            role="option"
                            aria-selected="false"
                            onClick={() => handleSelectSearch(result)}
                            className="block w-full text-left px-2 py-1.5 rounded-lg hover:bg-secondary text-sm"
                          >
                            {result.place_name}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className={`text-xs ${trackingSearchStatus.startsWith('Failed') || trackingSearchStatus.startsWith('Missing') ? 'text-aviation-red' : 'text-muted-foreground'}`} role="status">
                      {trackingSearchStatus || (searchResults.length > 0
                        ? 'Choose a matching address below.'
                        : 'Type at least 3 characters, then choose a matching address.')}
                    </p>
                  </div>
                  <div className="relative h-80 rounded-2xl overflow-hidden border border-border/60">
                    <div ref={mapContainerRef} className="absolute inset-0" />
                    <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2 pointer-events-none">
                      <span className="flex items-center gap-2 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur">
                        <span className="h-2.5 w-2.5 rounded-full bg-aviation-amber shadow-[0_0_8px_rgba(255,186,73,0.9)]" />
                        Viewer
                      </span>
                      <span className="flex items-center gap-2 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur">
                        <span className="h-2.5 w-4 rounded-sm border border-sky-400 bg-sky-400/20" />
                        Tracking area
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        </section>

        <section className="card-glass rounded-3xl p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <h2 className="text-2xl font-semibold">Photo Library</h2>
            <PhotoUpload onUpload={handleUpload} />
          </div>

          <div className="space-y-4">
            {sortedPhotos.length === 0 ? (
              <p className="text-muted-foreground">No photos uploaded yet.</p>
            ) : (
              sortedPhotos.map((photo, index) => (
                <div key={photo.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border/60 p-4 md:flex-row">
                  <div className="h-28 w-full shrink-0 overflow-hidden rounded-xl bg-black/40 md:w-40">
                    <img src={photo.thumb || photo.url} alt={photo.location || 'Photo'} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    {photo.location && (
                      <p className="break-words text-sm text-muted-foreground">Location: {photo.location}</p>
                    )}
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={photo.enabled !== false}
                          disabled={photoActionId !== null}
                          onCheckedChange={(value) => handleUpdatePhoto(
                            photo.id,
                            { enabled: value },
                            value ? 'Photo enabled.' : 'Photo hidden from the slideshow.'
                          )}
                        />
                        <span className="text-sm text-muted-foreground">Enabled</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => handleReorder(index, 'up')}
                          disabled={photoActionId !== null || index === 0}
                        >
                          Move up
                        </Button>
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => handleReorder(index, 'down')}
                          disabled={photoActionId !== null || index === sortedPhotos.length - 1}
                        >
                          Move down
                        </Button>
                      </div>
                      <Button
                        variant="destructive"
                        className="w-full sm:ml-auto sm:w-auto"
                        onClick={() => handleDeletePhoto(photo.id)}
                        disabled={photoActionId !== null}
                      >
                        {photoActionId === photo.id ? 'Updating...' : 'Delete'}
                      </Button>
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

type PhotoUploadDisplayStatus = PhotoUploadStatus | {
  stage: 'complete' | 'error';
  progress: number;
  message?: string;
};

const getUploadStatusLabel = (status: PhotoUploadDisplayStatus) => {
  switch (status.stage) {
    case 'uploading':
      return `Uploading photos… ${status.progress}%`;
    case 'processing':
      return 'Upload complete. Processing photos…';
    case 'refreshing':
      return 'Processing complete. Refreshing library…';
    case 'complete':
      return 'Photos added to the library.';
    case 'error':
      return status.message || 'Upload failed. You can try again.';
  }
};

const getUploadButtonLabel = (status: PhotoUploadDisplayStatus | null) => {
  if (status?.stage === 'processing') return 'Processing…';
  if (status?.stage === 'refreshing') return 'Finishing…';
  return 'Uploading…';
};

const PhotoUpload = ({
  onUpload
}: {
  onUpload: (files: File[], onStatus: PhotoUploadStatusListener) => Promise<void>;
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<PhotoUploadDisplayStatus | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setStatus({ stage: 'uploading', progress: 0 });
    try {
      await onUpload(files, setStatus);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
      setStatus({ stage: 'complete', progress: 100 });
    } catch (error) {
      setStatus({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Upload failed. You can try again.'
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-2 lg:max-w-xl">
      <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={uploading}
          onChange={(event) => {
            setFiles(Array.from(event.target.files || []));
            setStatus(null);
          }}
          className="min-w-0 w-full sm:w-72"
        />
        <Button
          className="w-full whitespace-nowrap sm:w-auto"
          onClick={handleSubmit}
          disabled={files.length === 0 || uploading}
        >
          {uploading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {uploading ? getUploadButtonLabel(status) : 'Upload photos'}
        </Button>
      </div>

      {files.length > 0 && !uploading && status?.stage !== 'complete' && (
        <p className="text-xs text-muted-foreground">
          {files.length} photo{files.length === 1 ? '' : 's'} selected · {formatPhotoUploadSize(totalSize)}
        </p>
      )}

      {status && (
        <div
          className="space-y-2"
          role="status"
          aria-live="polite"
          aria-label={getUploadStatusLabel(status)}
        >
          <Progress
            value={status.progress}
            className={status.stage === 'error' ? 'h-2 [&>div]:bg-destructive' : 'h-2'}
          />
          <div className={`flex items-center gap-2 text-xs ${status.stage === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {status.stage === 'complete' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            ) : status.stage !== 'error' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            <span>{getUploadStatusLabel(status)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
