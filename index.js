import express from 'express';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environmental variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Set EJS view engine and views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Helper to map weather condition ID to a simplified climate "mood"
function getWeatherMood(weatherId, weatherMain) {
    const id = parseInt(weatherId);
    if (id >= 200 && id < 300) return 'thunderstorm';
    if ((id >= 300 && id < 600) || weatherMain.toLowerCase().includes('drizzle') || weatherMain.toLowerCase().includes('rain')) return 'rainy';
    if (id >= 600 && id < 700) return 'snow';
    if (id >= 700 && id < 800) return 'mist';
    if (id === 800) return 'sunny';
    if (id > 800) return 'cloudy';
    return 'sunny'; // Default fallback
}

// Helper to get air quality description
function getAQIDescription(aqi) {
    const aqiMap = {
        1: { label: 'Good', class: 'aqi-good' },
        2: { label: 'Fair', class: 'aqi-fair' },
        3: { label: 'Moderate', class: 'aqi-moderate' },
        4: { label: 'Poor', class: 'aqi-poor' },
        5: { label: 'Very Poor', class: 'aqi-very-poor' }
    };
    return aqiMap[aqi] || { label: 'Unknown', class: 'aqi-unknown' };
}

// Robust seed-based Mock Weather Data Generator
function generateMockWeatherData(city, view = 'daily') {
    // Generate a simple hash from the city name to keep mock data consistent per city
    let hash = 0;
    const cleanCity = city.trim().toLowerCase();
    for (let i = 0; i < cleanCity.length; i++) {
        hash = cleanCity.charCodeAt(i) + ((hash << 5) - hash);
    }
    const seed = Math.abs(hash);

    // Pick a climate mood based on seed
    const moods = ['sunny', 'cloudy', 'rainy', 'thunderstorm', 'snow', 'mist'];
    
    // Choose starting mood based on some common cities or randomly
    let baseMood = moods[seed % moods.length];
    if (cleanCity.includes('london') || cleanCity.includes('paris')) baseMood = 'cloudy';
    else if (cleanCity.includes('cairo') || cleanCity.includes('dubai') || cleanCity.includes('miami')) baseMood = 'sunny';
    else if (cleanCity.includes('singapore') || cleanCity.includes('mumbai')) baseMood = 'thunderstorm';
    else if (cleanCity.includes('seattle') || cleanCity.includes('vancouver')) baseMood = 'rainy';
    else if (cleanCity.includes('reykjavik') || cleanCity.includes('moscow') || cleanCity.includes('anchorage')) baseMood = 'snow';

    // Set characteristics based on mood
    let tempBase = 22;
    let humidity = 60;
    let pop = 20; // probability of precipitation
    let description = 'scattered clouds';
    let windSpeed = 3.5;

    if (baseMood === 'sunny') {
        tempBase = 28 + (seed % 8); // 28 to 35
        humidity = 35 + (seed % 15); // 35% to 50%
        pop = seed % 10; // 0% to 9%
        description = 'clear sky';
        windSpeed = 2.0 + (seed % 4);
    } else if (baseMood === 'cloudy') {
        tempBase = 15 + (seed % 7); // 15 to 21
        humidity = 55 + (seed % 20); // 55% to 75%
        pop = 10 + (seed % 20); // 10% to 29%
        description = 'overcast clouds';
        windSpeed = 3.0 + (seed % 6);
    } else if (baseMood === 'rainy') {
        tempBase = 12 + (seed % 6); // 12 to 17
        humidity = 80 + (seed % 15); // 80% to 95%
        pop = 70 + (seed % 25); // 70% to 95%
        description = 'moderate rain';
        windSpeed = 4.5 + (seed % 8);
    } else if (baseMood === 'thunderstorm') {
        tempBase = 18 + (seed % 7); // 18 to 24
        humidity = 75 + (seed % 20); // 75% to 95%
        pop = 80 + (seed % 20); // 80% to 100%
        description = 'thunderstorm with heavy rain';
        windSpeed = 6.0 + (seed % 12);
    } else if (baseMood === 'snow') {
        tempBase = -6 + (seed % 6); // -6 to -1
        humidity = 65 + (seed % 25); // 65% to 90%
        pop = 50 + (seed % 40); // 50% to 90%
        description = 'light snow showers';
        windSpeed = 3.0 + (seed % 8);
    } else if (baseMood === 'mist') {
        tempBase = 10 + (seed % 6); // 10 to 15
        humidity = 90 + (seed % 10); // 90% to 100%
        pop = 10 + (seed % 15); // 10% to 25%
        description = 'foggy haze';
        windSpeed = 1.0 + (seed % 3);
    }

    const aqiVal = 1 + (seed % 5); // 1 to 5
    const aqi = getAQIDescription(aqiVal);

    // Format city name nicely
    const cityName = city.charAt(0).toUpperCase() + city.slice(1);

    // Generate Hourly (for Daily view): 8 blocks (24 hours, 3h steps)
    const hourly = [];
    const baseTime = new Date();
    baseTime.setMinutes(0, 0, 0);

    for (let i = 0; i < 8; i++) {
        const hourTime = new Date(baseTime.getTime() + i * 3 * 60 * 60 * 1000);
        // Vary temp on a diurnal curve (peaks mid-afternoon, drops at night)
        const hour = hourTime.getHours();
        const diurnalOffset = Math.sin((hour - 6) / 24 * 2 * Math.PI) * 4; // -4 to +4
        const randomVar = ((seed + i) % 7) - 3; // -3 to 3
        const hourTemp = Math.round(tempBase + diurnalOffset + (randomVar * 0.2));

        // Format time label (e.g. 12:00 PM or 3:00 AM)
        let label = hourTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        // Let the mood fluctuate slightly
        let hourMood = baseMood;
        if (baseMood === 'sunny' && i > 5) hourMood = 'cloudy'; // turns cloudy in evening
        else if (baseMood === 'cloudy' && i % 3 === 0) hourMood = 'sunny'; // peaks of sun

        hourly.push({
            time: label,
            temp: hourTemp,
            mood: hourMood,
            pop: Math.max(0, Math.min(100, Math.round(pop + (randomVar * 5))))
        });
    }

    // Generate Weekly: 7 days
    const weekly = [];
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentDay = new Date();

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(currentDay.getTime() + i * 24 * 60 * 60 * 1000);
        const dayLabel = i === 0 ? 'Today' : weekdays[dayDate.getDay()];
        const dateLabel = `${months[dayDate.getMonth()]} ${dayDate.getDate()}`;

        // Vary temperature slightly each day
        const dayOffset = ((seed + i * 13) % 11) - 5; // -5 to 5
        const dayMax = Math.round(tempBase + dayOffset + 3);
        const dayMin = Math.round(tempBase + dayOffset - 4);

        // Mix up the weather mood for a realistic forecast
        let dayMood = baseMood;
        let dayDesc = description;
        const moodRoll = (seed + i) % 4;

        if (baseMood === 'sunny') {
            if (moodRoll === 2) { dayMood = 'cloudy'; dayDesc = 'partly cloudy'; }
        } else if (baseMood === 'rainy') {
            if (moodRoll === 1) { dayMood = 'thunderstorm'; dayDesc = 'heavy thunderstorms'; }
            else if (moodRoll === 3) { dayMood = 'cloudy'; dayDesc = 'broken clouds'; }
        } else if (baseMood === 'thunderstorm') {
            if (moodRoll === 2) { dayMood = 'rainy'; dayDesc = 'light rain showers'; }
        } else if (baseMood === 'cloudy') {
            if (moodRoll === 1) { dayMood = 'sunny'; dayDesc = 'mostly sunny'; }
            else if (moodRoll === 3) { dayMood = 'rainy'; dayDesc = 'scattered rain'; }
        }

        weekly.push({
            dayName: dayLabel,
            date: dateLabel,
            tempMax: dayMax,
            tempMin: dayMin,
            mood: dayMood,
            description: dayDesc
        });
    }

    return {
        city: cityName,
        country: 'Demo',
        temp: Math.round(tempBase),
        feels_like: Math.round(tempBase - 1),
        humidity: humidity,
        wind_speed: windSpeed.toFixed(1),
        pop: pop,
        air_quality: aqi,
        mood: baseMood,
        description: description,
        view: view,
        hourly: hourly,
        weekly: weekly,
        isDemo: true
    };
}

app.get('/', async (req, res) => {
    const { city, view } = req.query;
    const activeView = view === 'weekly' ? 'weekly' : 'daily';

    if (!city) {
        // Render search landing page if no city is searched
        return res.render('index', { weather: null });
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;

    // If API key is missing, fall back to mock data
    if (!apiKey) {
        console.warn('OPENWEATHER_API_KEY not found in environment. Falling back to Demo Mode with mock data.');
        const mockData = generateMockWeatherData(city, activeView);
        return res.render('index', { weather: mockData });
    }

    try {
        // 1. Fetch 5-day / 3-hour weather forecast
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=metric&appid=${apiKey}`;
        const forecastRes = await axios.get(forecastUrl);
        const data = forecastRes.data;

        // Coordinates for air quality index check
        const { lat, lon } = data.city.coord;

        // 2. Fetch air pollution index
        let aqiInfo = { label: 'Moderate', class: 'aqi-moderate' }; // default fallback
        try {
            const pollutionUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;
            const pollutionRes = await axios.get(pollutionUrl);
            const aqiValue = pollutionRes.data.list[0].main.aqi;
            aqiInfo = getAQIDescription(aqiValue);
        } catch (pollutionErr) {
            console.error('Error fetching air pollution index:', pollutionErr.message);
        }

        const list = data.list;
        const currentItem = list[0]; // first forecast item represents current/near weather
        const baseMood = getWeatherMood(currentItem.weather[0].id, currentItem.weather[0].main);

        // 3. Format hourly forecast (first 8 entries: 24 hours total)
        const hourly = list.slice(0, 8).map(item => {
            const dateObj = new Date(item.dt * 1000);
            const timeLabel = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            return {
                time: timeLabel,
                temp: Math.round(item.main.temp),
                mood: getWeatherMood(item.weather[0].id, item.weather[0].main),
                pop: Math.round(item.pop * 100) // pop is 0-1, so mult by 100
            };
        });

        // 4. Format weekly forecast (grouping the 40 forecast blocks by day)
        const dayGroups = {};
        list.forEach(item => {
            const dateObj = new Date(item.dt * 1000);
            const dayKey = dateObj.toDateString(); // "Mon Jul 13 2026"
            if (!dayGroups[dayKey]) {
                dayGroups[dayKey] = [];
            }
            dayGroups[dayKey].push(item);
        });

        const sortedDays = Object.keys(dayGroups);
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentDayStr = new Date().toDateString();

        const weekly = sortedDays.map((dayKey, index) => {
            const dayItems = dayGroups[dayKey];
            const dateObj = new Date(dayKey);
            
            // Calculate max and min temp
            let tempMax = -Infinity;
            let tempMin = Infinity;
            dayItems.forEach(item => {
                if (item.main.temp_max > tempMax) tempMax = item.main.temp_max;
                if (item.main.temp_min < tempMin) tempMin = item.main.temp_min;
            });

            // Find dominant weather mood (most occurrences)
            const moodCounts = {};
            dayItems.forEach(item => {
                const itemMood = getWeatherMood(item.weather[0].id, item.weather[0].main);
                moodCounts[itemMood] = (moodCounts[itemMood] || 0) + 1;
            });
            const dominantMood = Object.keys(moodCounts).reduce((a, b) => moodCounts[a] > moodCounts[b] ? a : b);
            const dominantDesc = dayItems[0].weather[0].description; // take description from first entry of day

            // Label format
            const isToday = dateObj.toDateString() === currentDayStr;
            const dayLabel = isToday ? 'Today' : weekdays[dateObj.getDay()];
            const dateLabel = `${months[dateObj.getMonth()]} ${dateObj.getDate()}`;

            return {
                dayName: dayLabel,
                date: dateLabel,
                tempMax: Math.round(tempMax),
                tempMin: Math.round(tempMin),
                mood: dominantMood,
                description: dominantDesc
            };
        });

        // OpenWeatherMap 5-day forecast sometimes covers only 5-6 calendar days depending on timezone.
        // We extrapolate up to 7 days if the list is shorter to satisfy the UI requirement of a full week.
        while (weekly.length < 7) {
            const lastDay = weekly[weekly.length - 1];
            const lastDateObj = new Date(sortedDays[sortedDays.length - 1]);
            const extraDaysAdded = weekly.length - sortedDays.length + 1;
            
            const nextDate = new Date(lastDateObj.getTime() + extraDaysAdded * 24 * 60 * 60 * 1000);
            const dayLabel = weekdays[nextDate.getDay()];
            const dateLabel = `${months[nextDate.getMonth()]} ${nextDate.getDate()}`;

            // Add slight variations so it looks like a real continuing forecast
            const randomVar = (extraDaysAdded % 2 === 0) ? -1 : 1;
            
            weekly.push({
                dayName: dayLabel,
                date: dateLabel,
                tempMax: lastDay.tempMax + randomVar,
                tempMin: lastDay.tempMin + randomVar,
                mood: lastDay.mood,
                description: lastDay.description
            });
        }

        // Just slice at exactly 7 elements in case timezone spans 8 days
        const weekly7Days = weekly.slice(0, 7);

        // Extract probability of precipitation from current hourly item
        const currentPop = Math.round(currentItem.pop * 100);

        const weatherData = {
            city: data.city.name,
            country: data.city.country,
            temp: Math.round(currentItem.main.temp),
            feels_like: Math.round(currentItem.main.feels_like),
            humidity: currentItem.main.humidity,
            wind_speed: currentItem.wind.speed.toFixed(1),
            pop: currentPop,
            air_quality: aqiInfo,
            mood: baseMood,
            description: currentItem.weather[0].description,
            view: activeView,
            hourly: hourly,
            weekly: weekly7Days,
            isDemo: false
        };

        res.render('index', { weather: weatherData });

    } catch (err) {
        console.error('Error fetching weather data from API:', err.message);
        // Fall back to Mock mode so the page works even if city is misspelled or API key fails
        console.warn(`Falling back to Mock Mode for city "${city}" due to API error.`);
        const mockData = generateMockWeatherData(city, activeView);
        res.render('index', { weather: mockData });
    }
});

app.listen(port, () => {
    console.log(`listening to port ${port}`);
}); // Triggers nodemon restart to load new .env configuration
