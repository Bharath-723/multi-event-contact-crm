import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const text = searchParams.get('text')?.trim();

    if (!text || text.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const apiKey = process.env.GEOAPIFY_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { results: [], message: 'Geoapify API key is not configured' },
        { status: 200 }
      );
    }

    // Geoapify Geocoding Autocomplete API Endpoint
    // Biased toward Hyderabad (bbox approx 78.2,17.2,78.6,17.6) and restricted to India (countrycode:in)
    const geoapifyUrl = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
    geoapifyUrl.searchParams.set('text', text);
    geoapifyUrl.searchParams.set('filter', 'countrycode:in');
    geoapifyUrl.searchParams.set('bias', 'rect:78.2,17.2,78.6,17.6');
    geoapifyUrl.searchParams.set('limit', '6');
    geoapifyUrl.searchParams.set('apiKey', apiKey);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(geoapifyUrl.toString(), {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Geoapify returned status ${response.status}`);
      return NextResponse.json({ results: [], error: 'Failed to fetch suggestions' });
    }

    const data = await response.json();

    interface GeoapifyFeature {
      properties?: {
        formatted?: string;
        name?: string;
        suburb?: string;
        district?: string;
        city?: string;
        postcode?: string;
        state?: string;
      };
    }

    const results = (data.features || []).map((f: GeoapifyFeature) => {
      const props = f.properties || {};
      return {
        formatted: props.formatted || props.name || '',
        name: props.name || '',
        suburb: props.suburb || props.district || '',
        city: props.city || '',
        postcode: props.postcode || '',
      };
    }).filter((item: { formatted: string }) => item.formatted.length > 0);

    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('Geoapify request timed out');
    } else {
      console.error('Error in geocode autocomplete route:', err);
    }
    return NextResponse.json({ results: [], error: 'Autocomplete request failed' });
  }
}
