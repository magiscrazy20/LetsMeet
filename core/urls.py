from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("video/", views.video, name="video"),
    path("voice/", views.voice, name="voice"),
    path("voice/<str:room_name>/", views.voice_room, name="voice_room"),
    path("chat/", views.chat, name="chat"),
    path("chat/<str:room_name>/", views.chat_room, name="chat_room"),
    path("custom/", views.custom_page, name="custom"),
    path("rooms/<str:room_name>/", views.room, name="room"),
    path("api/connection-details", views.connection_details, name="connection_details"),
    path("api/record/start", views.record_start, name="record_start"),
    path("api/record/stop", views.record_stop, name="record_stop"),
]
