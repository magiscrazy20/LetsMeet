from django.conf import settings


def frontend_flags(request):
    return {
        "SHOW_SETTINGS_MENU": settings.SHOW_SETTINGS_MENU,
        "RECORD_ENDPOINT": settings.RECORD_ENDPOINT,
    }
