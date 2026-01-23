require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const { createFlightAdapter, validateProviderConfig } = require('./adapters');
const { normalizeFlightData } = require('./lib/flightNormalizer');
const adminAuth = require('./middleware/adminAuth');

const app = express();
const PORT = process.env.PORT || 8000;

// Configuration loaded from config.json
const CONFIG_PATH = path.join(__dirname, 'config.json');
let config = null;
let flightAdapter = null;

const defaultSlideshowSettings = {
    interval: 10000,
    shuffle: true,
    fitMode: 'cover'
};

// Load configuration on startup
function loadConfig() {
    try {
        const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
        config = JSON.parse(configData);

        if (!config.slideshow) {
            config.slideshow = { ...defaultSlideshowSettings };
        }
        
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
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2));
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

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
});

// Parse JSON bodies
app.use(express.json());
app.use(cookieParser());

// Mount photo API routes

const photosRouter = require('./routes/photos');
app.use('/api/photos', photosRouter);

// Serve photos statically
app.use('/photos', express.static(path.join(__dirname, 'photos')));

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
        res.json(normalizeFlightData(data));
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
    return res.json({ slideshow });
});

app.put('/api/settings', adminAuth, (req, res) => {
    try {
        if (!config) {
            return res.status(500).json({ error: 'Server configuration not loaded' });
        }

        const next = { ...config };
        const slideshow = req.body?.slideshow || {};

        next.slideshow = {
            interval: Number.isFinite(Number(slideshow.interval)) ? Number(slideshow.interval) : defaultSlideshowSettings.interval,
            shuffle: slideshow.shuffle === undefined ? defaultSlideshowSettings.shuffle : Boolean(slideshow.shuffle),
            fitMode: slideshow.fitMode === 'contain' ? 'contain' : defaultSlideshowSettings.fitMode
        };

        persistConfig(next);
        reloadConfig(next);

        return res.json({ slideshow: next.slideshow });
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
    });

    process.on('SIGINT', () => {
        console.log('\nShutting down server...');
        server.close(() => {
            process.exit(0);
        });
    });
}

module.exports = app;
