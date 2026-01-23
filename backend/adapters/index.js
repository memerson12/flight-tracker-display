const OpenSkyAdapter = require('./OpenSkyAdapter');
const FlightRadar24Adapter = require('./FlightRadar24Adapter');

/**
 * Factory function to create flight data adapters
 * @param {string} provider - Provider name ('opensky' or 'flightradar24')
 * @returns {FlightAdapter} Configured adapter instance
 */
function createFlightAdapter(provider) {
    const normalizedProvider = provider?.toLowerCase();
    
    switch (normalizedProvider) {
        case 'opensky':
            console.log('Creating OpenSky Network adapter');
            return new OpenSkyAdapter();
            
        case 'flightradar24':
        case 'fr24':
            console.log('Creating FlightRadar24 adapter');
            return new FlightRadar24Adapter();
            
        default:
            console.warn(`Unknown provider '${provider}', defaulting to FlightRadar24`);
            return new FlightRadar24Adapter();
    }
}

/**
 * Get list of available providers
 * @returns {Array<string>} Available provider names
 */
function getAvailableProviders() {
    return ['opensky', 'flightradar24'];
}

/**
 * Validate provider configuration
 * @param {string} provider - Provider name
 * @returns {Object} Validation result
 */
function validateProviderConfig(provider) {
    const normalizedProvider = provider?.toLowerCase();
    
    switch (normalizedProvider) {
        case 'opensky':
            const hasCredentials = !!(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET);
            return {
                valid: hasCredentials,
                provider: 'opensky',
                message: hasCredentials 
                    ? 'OpenSky credentials configured'
                    : 'OpenSky requires OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET environment variables'
            };
            
        case 'flightradar24':
        case 'fr24':
            return {
                valid: true,
                provider: 'flightradar24',
                message: 'FlightRadar24 requires no authentication'
            };
            
        default:
            return {
                valid: false,
                provider: provider,
                message: `Unknown provider '${provider}'. Available: ${getAvailableProviders().join(', ')}`
            };
    }
}

module.exports = {
    createFlightAdapter,
    getAvailableProviders,
    validateProviderConfig
};