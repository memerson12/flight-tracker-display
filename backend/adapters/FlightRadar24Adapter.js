const axios = require('axios');
const FlightAdapter = require('./FlightAdapter');

/**
 * FlightRadar24 adapter for flight data
 * Uses FlightRadar24's public API endpoints
 */
class FlightRadar24Adapter extends FlightAdapter {
    constructor() {
        super();
        this.name = 'flightradar24';
        this.baseUrl = 'https://data-cloud.flightradar24.com/zones/fcgi/feed.js';
        this.detailsUrl = 'https://data-live.flightradar24.com/clickhandler/';
        
        // Headers to mimic browser request
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:106.0) Gecko/20100101 Firefox/106.0',
            'cache-control': 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0',
            'accept': 'application/json'
        };
    }

    /**
     * Get flights in a specific area using FlightRadar24 API
     * @param {number} latitude - Center latitude
     * @param {number} longitude - Center longitude
     * @param {number} radiusKm - Radius in kilometers
     * @returns {Promise<Object>} Standardized flight data
     */
    async getFlightsInArea(latitude, longitude, radiusKm) {
        try {
            const bounds = this.calculateBounds(latitude, longitude, radiusKm);
            return this.getFlightsInBounds(bounds.north, bounds.south, bounds.west, bounds.east, {
                center: { lat: latitude, lon: longitude },
                radius: radiusKm * 1000, // Convert to meters
                location: `FlightRadar24 (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`
            });

        } catch (error) {
            console.error('FlightRadar24 API error:', error.message);
            throw new Error(`FlightRadar24 API failed: ${error.message}`);
        }
    }

    /**
     * Get flights in a specific rectangular area using FlightRadar24 API
     * @param {number} north - Northern boundary latitude
     * @param {number} south - Southern boundary latitude
     * @param {number} west - Western boundary longitude
     * @param {number} east - Eastern boundary longitude
     * @param {Object} options - Additional options for metadata
     * @returns {Promise<Object>} Standardized flight data
     */
    async getFlightsInBounds(north, south, west, east, options = {}) {
        try {
            // FlightRadar24 bounds format: north,south,west,east
            const boundsParam = `${north},${south},${west},${east}`;
            
            // Note: do not force a limit here — the provider returns all flights for the bounds
            const url = `${this.baseUrl}?bounds=${boundsParam}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=0&air=1&vehicles=0&estimated=0&maxage=14400&gliders=0&stats=0&ems=1`;
            
            console.log(`FlightRadar24: Fetching flights for bounds ${boundsParam}`);
            
            const response = await axios.get(url, {
                headers: this.headers,
                timeout: 10000
            });

            const rawData = response.data;
            
            // Calculate center point and radius for backward compatibility
            const centerLat = (north + south) / 2;
            const centerLon = (east + west) / 2;
            const latDiff = north - south;
            const lonDiff = east - west;
            const radius = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111000 / 2; // Approximate radius in meters
            
            return this.transformFlightData(rawData, {
                center: options.center || { lat: centerLat, lon: centerLon },
                radius: options.radius || radius,
                location: options.location || `FlightRadar24 Rectangle (${north.toFixed(4)}, ${west.toFixed(4)}) to (${south.toFixed(4)}, ${east.toFixed(4)})`,
                bounds: { north, south, west, east }
            });

        } catch (error) {
            console.error('FlightRadar24 API error:', error.message);
            throw new Error(`FlightRadar24 API failed: ${error.message}`);
        }
    }

    /**
     * Get detailed flight information
     * @param {string} flightId - Flight identifier from FR24
     * @returns {Promise<Object>} Detailed flight information
     */
    async getFlightDetails(flightId) {
        try {
            const url = `${this.detailsUrl}?flight=${flightId}`;
            
            const response = await axios.get(url, {
                headers: this.headers,
                timeout: 10000
            });

            return this.parseFlightDetails(response.data);

        } catch (error) {
            console.error('FlightRadar24 details error:', error.message);
            throw new Error(`Failed to get flight details: ${error.message}`);
        }
    }

    /**
     * Transform FlightRadar24 response to standardized format
     * @param {Object} rawData - Raw FR24 response
     * @param {Object} options - Additional options
     * @returns {Object} Standardized flight data
     */
    transformFlightData(rawData, options = {}) {
        const flights = [];
        
        // FR24 returns flights as object properties, not array
        // Skip metadata properties (version, full_count, etc.)
        for (const [key, value] of Object.entries(rawData)) {
            if (Array.isArray(value) && value.length >= 13) {
                const flight = this.parseFR24Flight(key, value);
                if (flight) {
                    flights.push(flight);
                }
            }
        }

        return {
            flights: flights.filter(f => f.latitude !== null && f.longitude !== null && !f.onGround),
            center: options.center || { lat: 0, lon: 0 },
            radius: options.radius || 0,
            location: options.location || 'Unknown',
            source: this.name,
            timestamp: Date.now()
        };
    }

    /**
     * Parse individual FR24 flight data
     * @param {string} id - Flight ID from FR24
     * @param {Array} data - Flight data array
     * @returns {Object|null} Standardized flight object
     */
    parseFR24Flight(id, data) {
        try {
            // FR24 flight data structure:
            // [0] icao24, [1] lat, [2] lon, [3] heading, [4] altitude, [5] velocity,
            // [6] squawk, [7] radar, [8] aircraft_type, [9] registration, [10] timestamp,
            // [11] origin, [12] destination, [13] flight_number, [14] on_ground, [15] vertical_rate, [16] callsign
            
            const [
                icao24, lat, lon, heading, altitude, velocity, squawk, radar,
                aircraft_type, registration, timestamp, origin, destination,
                flight_number, on_ground, vertical_rate, callsign
            ] = data;

            return {
                id: id,
                icao24: icao24 || '',
                callsign: callsign || flight_number || '',
                flightNumber: flight_number || '',
                airline: this.extractAirline(callsign || flight_number || ''),
                aircraft: aircraft_type || '',
                registration: registration || '',
                origin: origin || '',
                destination: destination || '',
                latitude: lat || null,
                longitude: lon || null,
                altitude: altitude ? altitude * 0.3048 : null, // Convert feet to meters
                heading: heading || null,
                velocity: velocity ? velocity * 0.514444 : null, // Convert knots to m/s
                verticalRate: vertical_rate ? vertical_rate * 0.00508 : null, // Convert fpm to m/s
                onGround: on_ground === 1,
                timestamp: timestamp || Date.now()
            };

        } catch (error) {
            console.warn(`Failed to parse FR24 flight ${id}:`, error.message);
            return null;
        }
    }

    /**
     * Extract airline from callsign/flight number
     * @param {string} callsign - Flight callsign or number
     * @returns {string} Airline code or name
     */
    extractAirline(callsign) {
        if (!callsign) return '';
        
        // Extract airline code (usually first 2-3 characters)
        const match = callsign.match(/^([A-Z]{2,3})/);
        return match ? match[1] : '';
    }

    /**
     * Parse detailed flight information response
     * @param {Object} data - FR24 flight details response
     * @returns {Object} Parsed flight details
     */
    parseFlightDetails(data) {
        return {
            identification: data.identification || {},
            aircraft: data.aircraft || {},
            airline: data.airline || {},
            airport: data.airport || {},
            flight: data.flight || {},
            trail: data.trail || []
        };
    }
}

module.exports = FlightRadar24Adapter;