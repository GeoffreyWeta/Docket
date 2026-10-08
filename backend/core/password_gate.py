"""Temporary credentials grant access only to password replacement and sign-out."""
from django.http import JsonResponse
from .models import AuthToken


class PasswordChangeGate:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        auth = request.headers.get("Authorization", "")
        allowed = {"/api/auth/change_password/", "/api/auth/logout/", "/api/auth/logout_all/"}
        if request.path.startswith("/api/") and request.path not in allowed and auth.startswith("Bearer "):
            if AuthToken.objects.filter(key=auth[7:], user__is_active=True,
                                        user__profile__must_change_password=True).exists():
                return JsonResponse({"error":"Change your temporary password before continuing.",
                                     "passwordChangeRequired":True}, status=403)
        return self.get_response(request)
