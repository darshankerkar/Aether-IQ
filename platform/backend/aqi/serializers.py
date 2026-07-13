from rest_framework import serializers
from .models import City, AQIStation, AQIReading, Recommendation, CitizenAlert


class CitySerializer(serializers.ModelSerializer):
    station_count = serializers.SerializerMethodField()

    class Meta:
        model = City
        fields = '__all__'

    def get_station_count(self, obj):
        return obj.stations.filter(is_active=True).count()


class AQIReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = AQIReading
        fields = [
            'id', 'timestamp',
            'pm25', 'pm10', 'no2', 'so2', 'co', 'o3',
            'aqi_value', 'aqi_category',
            'temperature', 'humidity', 'wind_speed', 'wind_dir',
            'precipitation', 'boundary_layer_height',
            'hour_of_day', 'day_of_week', 'is_weekend', 'month',
        ]


class AQIStationListSerializer(serializers.ModelSerializer):
    """Compact serializer for map markers and station lists."""
    city_name     = serializers.CharField(source='city.name', default=None)
    latest_aqi    = serializers.SerializerMethodField()
    latest_pm25   = serializers.SerializerMethodField()
    latest_ts     = serializers.SerializerMethodField()
    aqi_category  = serializers.SerializerMethodField()

    class Meta:
        model = AQIStation
        fields = [
            'id', 'station_id', 'name', 'city_name',
            'latitude', 'longitude', 'provider', 'is_active',
            'latest_aqi', 'latest_pm25', 'latest_ts', 'aqi_category',
        ]

    def get_latest_aqi(self, obj):
        r = obj.readings.order_by('-timestamp').first()
        return round(r.aqi_value, 1) if r and r.aqi_value else None

    def get_latest_pm25(self, obj):
        r = obj.readings.order_by('-timestamp').first()
        return round(r.pm25, 2) if r and r.pm25 else None

    def get_latest_ts(self, obj):
        r = obj.readings.order_by('-timestamp').first()
        return r.timestamp.isoformat() if r else None

    def get_aqi_category(self, obj):
        r = obj.readings.order_by('-timestamp').first()
        return r.aqi_category if r else "Unknown"


class AQIStationDetailSerializer(AQIStationListSerializer):
    """Full station detail with recent readings."""
    recent_readings = serializers.SerializerMethodField()
    city            = CitySerializer()

    class Meta(AQIStationListSerializer.Meta):
        fields = AQIStationListSerializer.Meta.fields + ['recent_readings', 'city']

    def get_recent_readings(self, obj):
        readings = obj.readings.order_by('-timestamp')[:72]
        return AQIReadingSerializer(readings, many=True).data


class RecommendationSerializer(serializers.ModelSerializer):
    station_name = serializers.CharField(source='station.name')
    latitude     = serializers.FloatField(source='station.latitude')
    longitude    = serializers.FloatField(source='station.longitude')

    class Meta:
        model = Recommendation
        fields = '__all__'


class CitizenAlertSerializer(serializers.ModelSerializer):
    station_name = serializers.CharField(source='station.name')

    class Meta:
        model = CitizenAlert
        fields = '__all__'
