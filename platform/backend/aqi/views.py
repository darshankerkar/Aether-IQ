from django.db.models import Avg, Max, Min, Count, Q
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from datetime import timedelta
from django.utils import timezone
from django.conf import settings

from .models import City, AQIStation, AQIReading, Recommendation, CitizenAlert
from .serializers import (
    CitySerializer, AQIStationListSerializer, AQIStationDetailSerializer,
    AQIReadingSerializer, RecommendationSerializer, CitizenAlertSerializer,
)


# ──────────────────────────────────────────────────────────────
# City ViewSet
# ──────────────────────────────────────────────────────────────
class CityViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = City.objects.all().order_by('name')
    serializer_class = CitySerializer


# ──────────────────────────────────────────────────────────────
# Station ViewSet
# ──────────────────────────────────────────────────────────────
class StationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AQIStation.objects.filter(is_active=True).select_related('city')

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return AQIStationDetailSerializer
        return AQIStationListSerializer

    @action(detail=True, methods=['get'], url_path='readings')
    def readings(self, request, pk=None):
        """Return last N hours of readings for a station."""
        station = self.get_object()
        hours   = int(request.query_params.get('hours', 72))
        cutoff  = timezone.now() - timedelta(hours=hours)
        qs      = station.readings.filter(timestamp__gte=cutoff).order_by('timestamp')
        return Response(AQIReadingSerializer(qs, many=True).data)


# ──────────────────────────────────────────────────────────────
# Aggregated / Intelligence Endpoints
# ──────────────────────────────────────────────────────────────
@api_view(['GET'])
def live_overview(request):
    """
    Returns city-level AQI summary using latest reading per station.
    Used by the Dashboard and Map pages.
    """
    # Use data-relative cutoff in case dataset is historical
    latest_ts = AQIReading.objects.order_by('-timestamp').values_list('timestamp', flat=True).first()
    cutoff = (latest_ts - timedelta(hours=48)) if latest_ts else (timezone.now() - timedelta(hours=48))

    stations = AQIStation.objects.filter(is_active=True).prefetch_related('readings')
    data     = []

    for s in stations:
        latest = s.readings.order_by('-timestamp').first()
        if not latest:
            continue
        data.append({
            'station_id': s.id,
            'name':       s.name,
            'latitude':   s.latitude,
            'longitude':  s.longitude,
            'city':       s.city.name if s.city else 'Unknown',
            'aqi':        round(latest.aqi_value, 1) if latest.aqi_value else None,
            'pm25':       round(latest.pm25, 2) if latest.pm25 else None,
            'pm10':       round(latest.pm10, 2) if latest.pm10 else None,
            'no2':        round(latest.no2, 2) if latest.no2 else None,
            'category':   latest.aqi_category,
            'timestamp':  latest.timestamp.isoformat(),
            'wind_speed': latest.wind_speed,
            'temperature': latest.temperature,
        })

    # Sort by AQI descending (worst first)
    data.sort(key=lambda x: x['aqi'] or 0, reverse=True)
    return Response({
        'count':    len(data),
        'stations': data,
    })


@api_view(['GET'])
def city_summary(request):
    """Returns aggregated per-city AQI stats for multi-city comparison."""
    latest_ts = AQIReading.objects.order_by('-timestamp').values_list('timestamp', flat=True).first()
    cutoff = (latest_ts - timedelta(hours=72)) if latest_ts else (timezone.now() - timedelta(hours=72))

    cities = City.objects.prefetch_related('stations__readings')
    result = []

    for city in cities:
        station_ids = city.stations.values_list('id', flat=True)
        readings = AQIReading.objects.filter(
            station_id__in=station_ids,
            timestamp__gte=cutoff,
            aqi_value__isnull=False
        )
        if not readings.exists():
            continue

        stats = readings.aggregate(
            avg_aqi=Avg('aqi_value'),
            max_aqi=Max('aqi_value'),
            min_aqi=Min('aqi_value'),
        )
        result.append({
            'city':        city.name,
            'state':       city.state,
            'latitude':    city.latitude,
            'longitude':   city.longitude,
            'avg_aqi':     round(stats['avg_aqi'] or 0, 1),
            'max_aqi':     round(stats['max_aqi'] or 0, 1),
            'min_aqi':     round(stats['min_aqi'] or 0, 1),
            'station_count': city.stations.count(),
        })

    result.sort(key=lambda x: x['avg_aqi'], reverse=True)
    return Response(result)


@api_view(['GET'])
def dashboard_kpis(request):
    """Returns top-level KPI numbers for the main dashboard."""
    latest_ts = AQIReading.objects.order_by('-timestamp').values_list('timestamp', flat=True).first()
    cutoff = (latest_ts - timedelta(hours=48)) if latest_ts else (timezone.now() - timedelta(hours=48))

    total_stations   = AQIStation.objects.filter(is_active=True).count()
    total_cities     = City.objects.count()
    recent_readings  = AQIReading.objects.filter(timestamp__gte=cutoff, aqi_value__isnull=False)

    avg_aqi = recent_readings.aggregate(a=Avg('aqi_value'))['a'] or 0
    max_row = recent_readings.order_by('-aqi_value').select_related('station__city').first()

    severe_count = recent_readings.filter(aqi_value__gte=300).values('station').distinct().count()
    poor_count   = recent_readings.filter(aqi_value__gte=200, aqi_value__lt=300).values('station').distinct().count()

    return Response({
        'total_stations':   total_stations,
        'total_cities':     total_cities,
        'national_avg_aqi': round(avg_aqi, 1),
        'severe_stations':  severe_count,
        'poor_stations':    poor_count,
        'worst_station': {
            'name':  max_row.station.name if max_row else None,
            'city':  max_row.station.city.name if max_row and max_row.station.city else None,
            'aqi':   round(max_row.aqi_value, 1) if max_row else None,
        } if max_row else None,
    })


@api_view(['GET'])
def pollutant_trends(request):
    """24-hour hourly pollutant averages across all stations (for national trend chart)."""
    hours = int(request.query_params.get('hours', 24))
    latest_ts = AQIReading.objects.order_by('-timestamp').values_list('timestamp', flat=True).first()
    cutoff = (latest_ts - timedelta(hours=hours)) if latest_ts else (timezone.now() - timedelta(hours=hours))

    readings = AQIReading.objects.filter(
        timestamp__gte=cutoff,
        aqi_value__isnull=False
    ).order_by('timestamp')

    # Group by hour
    from collections import defaultdict
    hourly = defaultdict(lambda: {'pm25': [], 'pm10': [], 'no2': [], 'aqi': []})
    for r in readings:
        key = r.timestamp.strftime('%Y-%m-%dT%H:00:00')
        if r.pm25:  hourly[key]['pm25'].append(r.pm25)
        if r.pm10:  hourly[key]['pm10'].append(r.pm10)
        if r.no2:   hourly[key]['no2'].append(r.no2)
        if r.aqi_value: hourly[key]['aqi'].append(r.aqi_value)

    result = []
    for ts in sorted(hourly.keys()):
        v = hourly[ts]
        result.append({
            'timestamp': ts,
            'pm25': round(sum(v['pm25'])/len(v['pm25']), 2) if v['pm25'] else None,
            'pm10': round(sum(v['pm10'])/len(v['pm10']), 2) if v['pm10'] else None,
            'no2':  round(sum(v['no2'])/len(v['no2']), 2)  if v['no2']  else None,
            'aqi':  round(sum(v['aqi'])/len(v['aqi']), 1)  if v['aqi']  else None,
        })

    return Response(result)


@api_view(['GET'])
def recommendations_list(request):
    """Returns latest AI recommendations, optionally filtered by city."""
    city = request.query_params.get('city')
    qs   = Recommendation.objects.select_related('station__city').order_by('priority', 'expected_aqi_delta')
    if city:
        qs = qs.filter(station__city__name__icontains=city)
    return Response(RecommendationSerializer(qs[:50], many=True).data)


@api_view(['GET'])
def citizen_alerts(request):
    """Returns active citizen health alerts."""
    qs = CitizenAlert.objects.select_related('station__city').order_by('-aqi_value')[:30]
    return Response(CitizenAlertSerializer(qs, many=True).data)
