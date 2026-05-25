@echo off
cd /d "%~dp0"
start "" "http://localhost:8040/"
D:\python\python.exe -m http.server 8040 --bind 0.0.0.0
