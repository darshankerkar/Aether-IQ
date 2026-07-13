from django.db import models


def aqi_category(val):
    """Return AQI category string from numeric value (India CPCB scale)."""
    if val is None:
        return "Unknown"
    val = float(val)
    if val <= 50:   return "Good"
    if val <= 100:  return "Satisfactory"
    if val <= 200:  return "Moderate"
    if val <= 300:  return "Poor"
    if val <= 400:  return "Very Poor"
    return "Severe"


class City(models.Model):
    name = models.CharField(max_length=100, unique=True)
    state = models.CharField(max_length=100, blank=True)
    latitude = models.FloatField(null=True)
    longitude = models.FloatField(null=True)
    population = models.BigIntegerField(null=True, blank=True)

    class Meta:
        verbose_name_plural = "Cities"
        ordering = ['name']

    def __str__(self):
        return self.name


class AQIStation(models.Model):
    """CAAQMS monitoring station."""
    station_id  = models.CharField(max_length=50, unique=True)
    name        = models.CharField(max_length=300)
    city        = models.ForeignKey(City, on_delete=models.SET_NULL, null=True, related_name='stations')
    provider    = models.CharField(max_length=100, blank=True)
    latitude    = models.FloatField()
    longitude   = models.FloatField()
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def latest_reading(self):
        return self.readings.order_by('-timestamp').first()


class AQIReading(models.Model):
    """Hourly AQI reading for a station (wide format — all pollutants per row)."""
    station   = models.ForeignKey(AQIStation, on_delete=models.CASCADE, related_name='readings')
    timestamp = models.DateTimeField(db_index=True)

    # Pollutant concentrations (µg/m³ except CO which is mg/m³)
    pm25  = models.FloatField(null=True, blank=True)
    pm10  = models.FloatField(null=True, blank=True)
    no2   = models.FloatField(null=True, blank=True)
    so2   = models.FloatField(null=True, blank=True)
    co    = models.FloatField(null=True, blank=True)
    o3    = models.FloatField(null=True, blank=True)

    # Computed AQI
    aqi_value    = models.FloatField(null=True, blank=True)
    aqi_category = models.CharField(max_length=50, blank=True)

    # Weather at time of reading (denormalized for ML efficiency)
    temperature   = models.FloatField(null=True, blank=True)
    humidity      = models.FloatField(null=True, blank=True)
    wind_speed    = models.FloatField(null=True, blank=True)
    wind_dir      = models.FloatField(null=True, blank=True)
    precipitation = models.FloatField(null=True, blank=True)
    pressure      = models.FloatField(null=True, blank=True)
    boundary_layer_height = models.FloatField(null=True, blank=True)
    cloud_cover   = models.FloatField(null=True, blank=True)

    # Time features (pre-computed for ML)
    hour_of_day = models.IntegerField(null=True, blank=True)
    day_of_week = models.IntegerField(null=True, blank=True)
    is_weekend  = models.BooleanField(default=False)
    month       = models.IntegerField(null=True, blank=True)

    class Meta:
        unique_together = [('station', 'timestamp')]
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['station', 'timestamp']),
            models.Index(fields=['timestamp']),
        ]

    def save(self, *args, **kwargs):
        # Auto-compute AQI category on save
        self.aqi_category = aqi_category(self.aqi_value)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.station.name} @ {self.timestamp}"


class Recommendation(models.Model):
    """AI-generated enforcement recommendation for a station."""
    PRIORITY_CHOICES = [('high', 'High'), ('medium', 'Medium'), ('low', 'Low')]

    station            = models.ForeignKey(AQIStation, on_delete=models.CASCADE, related_name='recommendations')
    created_at         = models.DateTimeField(auto_now_add=True)
    action             = models.CharField(max_length=300)
    rationale          = models.TextField(blank=True)
    expected_aqi_delta = models.FloatField(default=0.0)  # Negative = reduction
    priority           = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    confidence         = models.FloatField(default=0.0)   # 0–1

    class Meta:
        ordering = ['priority', 'expected_aqi_delta']

    def __str__(self):
        return f"{self.priority.upper()} | {self.action[:60]}"


class CitizenAlert(models.Model):
    """Health advisory alert for citizens."""
    RISK_CHOICES = [('low', 'Low'), ('moderate', 'Moderate'), ('high', 'High'), ('critical', 'Critical')]

    station    = models.ForeignKey(AQIStation, on_delete=models.CASCADE, related_name='alerts')
    created_at = models.DateTimeField(auto_now_add=True)
    risk_level = models.CharField(max_length=10, choices=RISK_CHOICES)
    aqi_value  = models.FloatField()
    message_en = models.TextField()
    message_hi = models.TextField(blank=True)
    advisory   = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']
