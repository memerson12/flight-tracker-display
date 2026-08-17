require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const { createFlightAdapter, validateProviderConfig } = require('./adapters');
const { normalizeFlightData } = require('./lib/flightNormalizer');
const { scheduleAircraftRegistryUpdates } = require('./lib/aircraftRegistryScheduler');
const { withObserverBearings } = require('./lib/observerBearing');
const { writeJsonAtomic } = require('./lib/atomicJsonStore');
const adminAuth = require('./middleware/adminAuth');
const {
    defaultClockSettings,
    defaultDisplaySettings,
    defaultSlideshowSettings,
    normalizeClockSettings,
    normalizeDisplaySettings,
    normalizeWindowPositionSettings
} = require('./lib/displaySettings');

const app = express();
const PORT = process.env.PORT || 8000;
const PHOTO_STORAGE_DIR = process.env.PHOTO_STORAGE_DIR
    ? path.resolve(process.env.PHOTO_STORAGE_DIR)
    : path.join(__dirname, 'photos');

// Configuration loaded from config.json
const CONFIG_PATH = process.env.CONFIG_PATH
    ? path.resolve(process.env.CONFIG_PATH)
    : path.join(__dirname, 'config.json');
let config = null;
let flightAdapter = null;

// Load configuration on startup
function loadConfig() {
    try {
        const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
        config = JSON.parse(configData);

        if (!config.slideshow) {
            config.slideshow = { ...defaultSlideshowSettings };
        }
        config.windowPosition = normalizeWindowPositionSettings(config.windowPosition);
        config.clock = normalizeClockSettings(config.clock);
        config.display = normalizeDisplaySettings(config.display);
        
        // Determine provider (config.json takes precedence over env var)
        const provider = config.provider || process.env.FLIGHT_PROVIDER || 'flightradar24';
        
        // Validate provider configuration
        const validation = validateProviderConfig(provider);
        if (!validation.valid) {
            console.error(`Provider configuration error: ${validation.message}`);
            process.exit(1);
        }
        
        // Create adapter
        flightAdapter = createFlightAdapter(provider);
        
        // Log configuration details
        if (config.area) {
            console.log(`Loaded config: monitoring ${config.area.name} - Rectangle from (${config.area.northwest.latitude}, ${config.area.northwest.longitude}) to (${config.area.southeast.latitude}, ${config.area.southeast.longitude})`);
        } else if (config.location) {
            console.log(`Loaded config: monitoring ${config.location.name} at ${config.location.latitude}, ${config.location.longitude}`);
        }
        console.log(`Using flight data provider: ${validation.provider}`);
        console.log(`Provider status: ${validation.message}`);
        
    } catch (error) {
        console.error('Failed to load config.json:', error.message);
        process.exit(1);
    }
}

function persistConfig(nextConfig) {
    writeJsonAtomic(CONFIG_PATH, nextConfig);
}

function reloadConfig(nextConfig) {
    config = nextConfig;

    const provider = config.provider || process.env.FLIGHT_PROVIDER || 'flightradar24';
    const validation = validateProviderConfig(provider);
    if (!validation.valid) {
        throw new Error(validation.message);
    }
    flightAdapter = createFlightAdapter(provider);
    return validation;
}

const allowedOrigins = new Set(
    String(process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
);

// Cross-origin access is opt-in. Same-origin requests and the Vite proxy do not
// require CORS response headers.
app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (origin && allowedOrigins.has(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403);
        return;
    }
    next();
});

// Parse JSON bodies
app.use(express.json());
app.use(cookieParser());

const adminSessionRouter = require('./routes/adminSession');
app.use('/api/admin/session', adminSessionRouter);

// Mount photo API routes

const photosRouter = require('./routes/photos');
app.use('/api/photos', photosRouter);

const PUBLIC_PHOTO_PATH = /^\/(?:thumbs\/)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpe?g|png|webp)$/i;

// Serve only generated photo assets. Databases, journals, temporary files, and
// arbitrary files under the storage directory must never become public.
app.use('/photos', (req, res, next) => {
    if (!PUBLIC_PHOTO_PATH.test(req.path)) return res.sendStatus(404);
    return next();
}, express.static(PHOTO_STORAGE_DIR, { dotfiles: 'deny', fallthrough: false }));

// Flight API endpoints using adapters
app.get('/api/flights/overhead', async (req, res) => {
    try {
        if (!config || !flightAdapter) {
            return res.status(500).json({ error: 'Server configuration not loaded' });
        }

        let data;
        
        if (config.area && config.area.type === 'rectangle') {
            // Use rectangle-based tracking
            const bounds = flightAdapter.rectangleToBounds(
                config.area.northwest,
                config.area.southeast
            );
            data = await flightAdapter.getFlightsInBounds(
                bounds.north,
                bounds.south,
                bounds.west,
                bounds.east
            );
        } else if (config.location) {
            // Use legacy circle-based tracking
            data = await flightAdapter.getFlightsInArea(
                config.location.latitude,
                config.location.longitude,
                config.location.radius
            );
        } else {
            return res.status(500).json({ error: 'Invalid configuration: missing location or area settings' });
        }
        console.log(`Fetched ${data.flights.length} flights from provider ${flightAdapter.name}`);
        const normalized = normalizeFlightData(data);
        res.json(withObserverBearings(normalized, config.windowPosition));
    } catch (error) {
        console.error('Error fetching flights:', error.message);
        res.status(500).json({ error: 'Failed to fetch flight data' });
    }
});

app.get('/api/settings', (req, res) => {
    if (!config) {
        return res.status(500).json({ error: 'Server configuration not loaded' });
    }

    const slideshow = { ...defaultSlideshowSettings, ...(config.slideshow || {}) };
    const privateWindowPosition = normalizeWindowPositionSettings(config.windowPosition);
    const windowPosition = {
        enabled: privateWindowPosition.enabled
            && privateWindowPosition.latitude !== null
            && privateWindowPosition.longitude !== null,
        bearing: privateWindowPosition.bearing,
        viewAngle: privateWindowPosition.viewAngle
    };
    const clock = normalizeClockSettings(config.clock);
    const display = normalizeDisplaySettings(config.display);
    return res.json({ slideshow, windowPosition, clock, display });
});

app.get('/api/admin/settings', adminAuth, (req, res) => {
    if (!config) {
        return res.status(500).json({ error: 'Server configuration not loaded' });
    }

    const slideshow = { ...defaultSlideshowSettings, ...(config.slideshow || {}) };
    const windowPosition = normalizeWindowPositionSettings(config.windowPosition);
    const clock = normalizeClockSettings(config.clock);
    const display = normalizeDisplaySettings(config.display);
    return res.json({ slideshow, windowPosition, clock, display });
});

app.put('/api/settings', adminAuth, (req, res) => {
    try {
        if (!config) {
            return res.status(500).json({ error: 'Server configuration not loaded' });
        }

        const next = { ...config };
        const slideshow = req.body?.slideshow;
        if (slideshow) {
            next.slideshow = {
                interval: Number.isFinite(Number(slideshow.interval)) ? Number(slideshow.interval) : defaultSlideshowSettings.interval,
                shuffle: slideshow.shuffle === undefined ? defaultSlideshowSettings.shuffle : Boolean(slideshow.shuffle),
                fitMode: slideshow.fitMode === 'contain' ? 'contain' : defaultSlideshowSettings.fitMode
            };
        } else if (!next.slideshow) {
            next.slideshow = { ...defaultSlideshowSettings };
        }

        next.windowPosition = req.body?.windowPosition
            ? normalizeWindowPositionSettings(req.body.windowPosition, next.windowPosition)
            : normalizeWindowPositionSettings(next.windowPosition);

        next.clock = req.body?.clock
            ? normalizeClockSettings(req.body.clock, next.clock)
            : normalizeClockSettings(next.clock || defaultClockSettings);

        next.display = req.body?.display
            ? normalizeDisplaySettings(req.body.display, next.display)
            : normalizeDisplaySettings(next.display || defaultDisplaySettings);

        persistConfig(next);
        reloadConfig(next);

        return res.json({ slideshow: next.slideshow, windowPosition: next.windowPosition, clock: next.clock, display: next.display });
    } catch (error) {
        console.error('Failed to update settings:', error.message);
        return res.status(500).json({ error: 'Failed to update settings' });
    }
});

app.get('/api/config', adminAuth, (req, res) => {
    if (!config) {
        return res.status(500).json({ error: 'Server configuration not loaded' });
    }

    const response = {
        provider: config.provider || 'flightradar24',
        location: config.location || null,
        area: config.area || null
    };

    return res.json(response);
});

app.put('/api/config', adminAuth, (req, res) => {
    try {
        if (!config) {
            return res.status(500).json({ error: 'Server configuration not loaded' });
        }

        const next = { ...config };
        const provider = req.body?.provider || next.provider || 'flightradar24';
        const location = req.body?.location || null;
        const area = req.body?.area || null;

        if (!location && !area) {
            return res.status(400).json({ error: 'Location or area is required' });
        }

        next.provider = provider;
        next.location = location;
        next.area = area;

        const validation = validateProviderConfig(provider);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.message });
        }

        persistConfig(next);
        reloadConfig(next);

        return res.json({ provider: next.provider, location: next.location, area: next.area });
    } catch (error) {
        console.error('Failed to update config:', error.message);
        return res.status(500).json({ error: 'Failed to update config' });
    }
});

app.get('/api/flights/:flightId/details', async (req, res) => {
    try {
        const { flightId } = req.params;

        if (!flightAdapter) {
            return res.status(500).json({ error: 'Flight adapter not initialized' });
        }

        const data = await flightAdapter.getFlightDetails(flightId);
        res.json(data);
    } catch (error) {
        console.error('Error fetching flight details:', error.message);
        res.status(500).json({ error: 'Failed to fetch flight details' });
    }
});

app.get('/api/airports/:icao/arrivals', async (req, res) => {
    try {
        const { icao } = req.params;
        const { begin, end } = req.query;

        const icaoUpper = String(icao || '').toUpperCase();
        if (!/^[A-Z]{4}$/.test(icaoUpper)) {
            return res.status(400).json({ error: 'Invalid ICAO airport code' });
        }

        if (!flightAdapter) {
            return res.status(500).json({ error: 'Flight adapter not initialized' });
        }

        const beginTs = begin ? parseInt(begin, 10) : undefined;
        const endTs = end ? parseInt(end, 10) : undefined;
        if ((begin && !Number.isFinite(beginTs)) || (end && !Number.isFinite(endTs))) {
            return res.status(400).json({ error: 'Invalid begin or end timestamp' });
        }

        const data = await flightAdapter.getAirportArrivals(icaoUpper, beginTs, endTs);
        
        if (data === null) {
            return res.status(501).json({ error: 'Arrivals not supported by current provider' });
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching arrivals:', error.message);
        res.status(500).json({ error: 'Failed to fetch arrival data' });
    }
});

app.get('/api/airports/:icao/departures', async (req, res) => {
    try {
        const { icao } = req.params;
        const { begin, end } = req.query;

        const icaoUpper = String(icao || '').toUpperCase();
        if (!/^[A-Z]{4}$/.test(icaoUpper)) {
            return res.status(400).json({ error: 'Invalid ICAO airport code' });
        }

        if (!flightAdapter) {
            return res.status(500).json({ error: 'Flight adapter not initialized' });
        }

        const beginTs = begin ? parseInt(begin, 10) : undefined;
        const endTs = end ? parseInt(end, 10) : undefined;
        if ((begin && !Number.isFinite(beginTs)) || (end && !Number.isFinite(endTs))) {
            return res.status(400).json({ error: 'Invalid begin or end timestamp' });
        }

        const data = await flightAdapter.getAirportDepartures(icaoUpper, beginTs, endTs);
        
        if (data === null) {
            return res.status(501).json({ error: 'Departures not supported by current provider' });
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching departures:', error.message);
        res.status(500).json({ error: 'Failed to fetch departure data' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        provider: flightAdapter?.name || 'none',
        config: !!config
    };

    // Add provider-specific health info if available
    if (flightAdapter && typeof flightAdapter.getHealthStatus === 'function') {
        health.providerStatus = flightAdapter.getHealthStatus();
    }

    res.json(health);
});

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Fallback to index.html for non-API routes
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: path.join(__dirname, '../frontend') });
});

// Load configuration before starting server
loadConfig();

let server = null;
if (require.main === module) {
    server = app.listen(PORT, () => {
        console.log(`Flight tracker server running at http://localhost:${PORT}`);
        console.log(`Flight data provider: ${flightAdapter?.name || 'none'}`);
        console.log('Ready to track flights! 🛩️');
        scheduleAircraftRegistryUpdates();
    });

    process.on('SIGINT', () => {
        console.log('\nShutting down server...');
        server.close(() => {
            process.exit(0);
        });
    });
}

module.exports = app;
