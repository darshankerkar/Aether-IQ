from django.contrib import admin
from .models import City, AQIStation, AQIReading, Recommendation, CitizenAlert


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ['name', 'state', 'latitude', 'longitude']
    search_fields = ['name', 'state']


@admin.register(AQIStation)
class AQIStationAdmin(admin.ModelAdmin):
    list_display = ['name', 'city', 'provider', 'latitude', 'longitude', 'is_active']
    list_filter  = ['is_active', 'provider', 'city']
    search_fields = ['name', 'station_id']


@admin.register(AQIReading)
class AQIReadingAdmin(admin.ModelAdmin):
    list_display = ['station', 'timestamp', 'aqi_value', 'aqi_category', 'pm25', 'pm10', 'no2']
    list_filter  = ['aqi_category', 'station__city']
    ordering     = ['-timestamp']


@admin.register(Recommendation)
class RecommendationAdmin(admin.ModelAdmin):
    list_display = ['station', 'action', 'priority', 'expected_aqi_delta', 'confidence', 'created_at']
    list_filter  = ['priority']


@admin.register(CitizenAlert)
class CitizenAlertAdmin(admin.ModelAdmin):
    list_display = ['station', 'risk_level', 'aqi_value', 'created_at']
    list_filter  = ['risk_level']
