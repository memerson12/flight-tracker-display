const axios = require('axios');
const FlightAdapter = require('./FlightAdapter');

/**
 * OpenSky Network adapter for flight data
 * Uses OpenSky Network API with OAuth2 authentication
 */
class OpenSkyAdapter extends FlightAdapter {
    constructor() {
        super();
        this.name = 'opensky';
        this.authUrl = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
        this.apiUrl = 'https://opensky-network.org/api';
        
        // Token management
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    /**
     * Get OAuth2 access token
     * @returns {Promise<string>} Access token
     */
    async getAccessToken() {
        // Check if we have a valid token
        if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
            return this.accessToken;
        }

        // Request new token
        try {
            console.log('OpenSky: Requesting new access token...');
            const response = await axios.post(this.authUrl, new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: process.env.OPENSKY_CLIENT_ID,
                client_secret: process.env.OPENSKY_CLIENT_SECRET
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.accessToken = response.data.access_token;
            // Token expires in 30 minutes, refresh 5 minutes early
            this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 300) * 1000);
            
            console.log('OpenSky: Access token obtained, expires at:', this.tokenExpiry);
            return this.accessToken;
        } catch (error) {
            console.error('OpenSky: Failed to obtain access token:', error.response?.data || error.message);
            throw new Error('OpenSky authentication failed');
        }
    }

    /**
     * Get flights in a specific area using OpenSky API
     * @param {number} latitude - Center latitude
     * @param {number} longitude - Center longitude
     * @param {number} radiusKm - Radius in kilometers
     * @returns {Promise<Object>} Standardized flight data
     */
    async getFlightsInArea(latitude, longitude, radiusKm) {
        try {
            const token = await this.getAccessToken();
            const bounds = this.calculateBounds(latitude, longitude, radiusKm);
            
            console.log(`OpenSky: Fetching flights for area ${latitude}, ${longitude} (radius: ${radiusKm}km)`);
            
            const response = await axios.get(`${this.apiUrl}/states/all`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'Flight-Tracker/1.0'
                },
                params: {
                    lamin: bounds.south,
                    lamax: bounds.north,
                    lomin: bounds.west,
                    lomax: bounds.east
                },
                timeout: 10000
            });

            const rawData = response.data;
            return this.transformFlightData(rawData, {
                center: { lat: latitude, lon: longitude },
                radius: radiusKm * 1000, // Convert to meters
                location: `OpenSky (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`
            });

        } catch (error) {
            console.error('OpenSky API error:', error.response?.data || error.message);
            throw new Error(`OpenSky API failed: ${error.message}`);
        }
    }

    /**
     * Get detailed flight information for an aircraft
     * @param {string} icao24 - ICAO24 aircraft identifier
     * @returns {Promise<Object>} Flight details
     */
    async getFlightDetails(icao24) {
        try {
            const token = await this.getAccessToken();
            
            const response = await axios.get(`${this.apiUrl}/flights/aircraft`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'Flight-Tracker/1.0'
                },
                params: { icao24 },
                timeout: 10000
            });

            return response.data;

        } catch (error) {
            console.error('OpenSky flight details error:', error.message);
            throw new Error(`Failed to get flight details: ${error.message}`);
        }
    }

    /**
     * Get arrivals for a specific airport
     * @param {string} airportCode - ICAO airport code
     * @param {number} begin - Start timestamp
     * @param {number} end - End timestamp
     * @returns {Promise<Object>} Arrival data
     */
    async getAirportArrivals(airportCode, begin, end) {
        try {
            const token = await this.getAccessToken();
            
            const response = await axios.get(`${this.apiUrl}/flights/arrival`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'Flight-Tracker/1.0'
                },
                params: { icao: airportCode, begin, end },
                timeout: 10000
            });

            return response.data;

        } catch (error) {
            console.error('OpenSky arrivals error:', error.message);
            throw new Error(`Failed to get arrivals: ${error.message}`);
        }
    }

    /**
     * Get departures for a specific airport
     * @param {string} airportCode - ICAO airport code
     * @param {number} begin - Start timestamp
     * @param {number} end - End timestamp
     * @returns {Promise<Object>} Departure data
     */
    async getAirportDepartures(airportCode, begin, end) {
        try {
            const token = await this.getAccessToken();
            
            const response = await axios.get(`${this.apiUrl}/flights/departure`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'Flight-Tracker/1.0'
                },
                params: { icao: airportCode, begin, end },
                timeout: 10000
            });

            return response.data;

        } catch (error) {
            console.error('OpenSky departures error:', error.message);
            throw new Error(`Failed to get departures: ${error.message}`);
        }
    }

    /**
     * Transform OpenSky response to standardized format
     * @param {Object} rawData - Raw OpenSky response
     * @param {Object} options - Additional options
     * @returns {Object} Standardized flight data
     */
    transformFlightData(rawData, options = {}) {
        const flights = [];
        
        if (rawData.states && Array.isArray(rawData.states)) {
            for (const state of rawData.states) {
                const flight = this.parseOpenSkyFlight(state);
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
            timestamp: rawData.time || Date.now()
        };
    }

    /**
     * Parse individual OpenSky flight state
     * @param {Array} state - OpenSky state vector
     * @returns {Object|null} Standardized flight object
     */
    parseOpenSkyFlight(state) {
        try {
            const [
                icao24, callsign, origin_country, time_position,
                last_contact, longitude, latitude, baro_altitude,
                on_ground, velocity, true_track, vertical_rate,
                sensors, geo_altitude, squawk, spi, position_source
            ] = state;

            const parsedCallsign = this.parseCallsign(callsign);

            return {
                id: this.generateFlightId(icao24, callsign),
                icao24: icao24 || '',
                callsign: callsign?.trim() || '',
                flightNumber: parsedCallsign.flightNumber || '',
                airline: parsedCallsign.airline || '',
                aircraft: '', // Not available in OpenSky states
                registration: '', // Not available in OpenSky states
                origin: '', // Not available in OpenSky states
                destination: '', // Not available in OpenSky states
                latitude: latitude,
                longitude: longitude,
                altitude: baro_altitude,
                heading: true_track,
                velocity: velocity,
                verticalRate: vertical_rate,
                onGround: on_ground || false,
                timestamp: last_contact ? last_contact * 1000 : Date.now()
            };

        } catch (error) {
            console.warn('Failed to parse OpenSky flight:', error.message);
            return null;
        }
    }

    /**
     * Parse callsign to extract airline and flight number
     * @param {string} callsign - Raw callsign
     * @returns {Object} Parsed callsign info
     */
    parseCallsign(callsign) {
        if (!callsign) return { airline: '', flightNumber: '' };
        
        const trimmed = callsign.trim();
        
        // Try to extract airline code (usually first 2-3 letters)
        const match = trimmed.match(/^([A-Z]{2,3})(\d+.*)?$/);
        if (match) {
            return {
                airline: match[1],
                flightNumber: match[2] || ''
            };
        }
        
        return { airline: '', flightNumber: trimmed };
    }

    /**
     * Get health status of the adapter
     * @returns {Object} Health status
     */
    getHealthStatus() {
        return {
            name: this.name,
            hasToken: !!this.accessToken,
            tokenExpiry: this.tokenExpiry ? this.tokenExpiry.toISOString() : null,
            configured: !!(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET)
        };
    }
}

module.exports = OpenSkyAdapter;