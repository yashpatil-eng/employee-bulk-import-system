from django.shortcuts import render


def employee_dashboard(request):
    return render(request, 'employee_dashboard.html')

def login_page(request):
    return render(request, "login.html")

def register_page(request):
    return render(request, "register.html")