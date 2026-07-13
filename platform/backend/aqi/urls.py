from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'cities',   views.CityViewSet,    basename='city')
router.register(r'stations', views.StationViewSet, basename='station')

urlpatterns = [
    path('', include(router.urls)),
    # Dashboard + intelligence
    path('live/',               views.live_overview,      name='live-overview'),
    path('city-summary/',       views.city_summary,       name='city-summary'),
    path('kpis/',               views.dashboard_kpis,     name='dashboard-kpis'),
    path('trends/',             views.pollutant_trends,   name='pollutant-trends'),
    path('recommendations/',    views.recommendations_list, name='recommendations'),
    path('alerts/',             views.citizen_alerts,     name='citizen-alerts'),
]
