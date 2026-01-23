/**
 * Base class for flight data adapters
 * Defines the interface that all flight data providers must implement
 */
class FlightAdapter {
    constructor() {
        this.name = 'base';
    }

    /**
     * Get flights in a specific area
     * @param {number} latitude - Center latitude
     * @param {number} longitude - Center longitude  
     * @param {number} radiusKm - Radius in kilometers
     * @returns {Promise<Object>} Standardized flight data
     */
    async getFlightsInArea(latitude, longitude, radiusKm) {
        throw new Error('Must implement getFlightsInArea method');
    }

    /**
     * Get flights in a specific rectangular area
     * @param {number} north - Northern boundary latitude
     * @param {number} south - Southern boundary latitude
     * @param {number} west - Western boundary longitude
     * @param {number} east - Eastern boundary longitude
     * @returns {Promise<Object>} Standardized flight data
     */
    async getFlightsInBounds(north, south, west, east) {
        throw new Error('Must implement getFlightsInBounds method');
    }

    /**
     * Get detailed information for a specific flight
     * @param {string} flightId - Flight identifier
     * @returns {Promise<Object>} Detailed flight information
     */
    async getFlightDetails(flightId) {
        throw new Error('Must implement getFlightDetails method');
    }

    /**
     * Get arrivals for a specific airport (optional)
     * @param {string} airportCode - ICAO airport code
     * @param {number} begin - Start timestamp
     * @param {number} end - End timestamp
     * @returns {Promise<Object|null>} Arrival data or null if not supported
     */
    async getAirportArrivals(airportCode, begin, end) {
        return null; // Optional method
    }

    /**
     * Get departures for a specific airport (optional)
     * @param {string} airportCode - ICAO airport code
     * @param {number} begin - Start timestamp
     * @param {number} end - End timestamp
     * @returns {Promise<Object|null>} Departure data or null if not supported
     */
    async getAirportDepartures(airportCode, begin, end) {
        return null; // Optional method
    }

    /**
     * Transform raw flight data to standardized format
     * @param {Object} rawData - Raw data from provider
     * @param {Object} options - Additional options (center, radius, etc.)
     * @returns {Object} Standardized flight data structure
     */
    transformFlightData(rawData, options = {}) {
        return {
            flights: [],
            center: options.center || { lat: 0, lon: 0 },
            radius: options.radius || 0,
            location: options.location || 'Unknown',
            source: this.name,
            timestamp: Date.now()
        };
    }

    /**
     * Create standardized flight object
     * @param {Object} rawFlight - Raw flight data from provider
     * @returns {Object} Standardized flight object
     */
    createStandardFlight(rawFlight) {
        return {
            id: '',
            icao24: '',
            callsign: '',
            flightNumber: '',
            airline: '',
            aircraft: '',
            registration: '',
            origin: '',
            destination: '',
            latitude: null,
            longitude: null,
            altitude: null,
            heading: null,
            velocity: null,
            verticalRate: null,
            onGround: false,
            timestamp: Date.now()
        };
    }

    /**
     * Calculate bounding box for area search
     * @param {number} latitude - Center latitude
     * @param {number} longitude - Center longitude
     * @param {number} radiusKm - Radius in kilometers
     * @returns {Object} Bounding box coordinates
     */
    calculateBounds(latitude, longitude, radiusKm) {
        const radiusMeters = radiusKm * 1000;
        const latOffset = radiusMeters / 111000; // roughly 111km per degree
        const lonOffset = radiusMeters / (111000 * Math.cos(latitude * Math.PI / 180));

        return {
            north: latitude + latOffset,
            south: latitude - latOffset,
            east: longitude + lonOffset,
            west: longitude - lonOffset
        };
    }

    /**
     * Convert rectangle coordinates to bounds
     * @param {Object} northwest - Northwest corner {latitude, longitude}
     * @param {Object} southeast - Southeast corner {latitude, longitude}
     * @returns {Object} Bounding box coordinates
     */
    rectangleToBounds(northwest, southeast) {
        return {
            north: northwest.latitude,
            south: southeast.latitude,
            west: northwest.longitude,
            east: southeast.longitude
        };
    }

    /**
     * Generate unique flight ID
     * @param {string} icao24 - ICAO24 address
     * @param {string} callsign - Flight callsign
     * @returns {string} Unique flight ID
     */
    generateFlightId(icao24, callsign) {
        return `${icao24 || 'unknown'}_${callsign || 'unknown'}`;
    }
}

module.exports = FlightAdapter;