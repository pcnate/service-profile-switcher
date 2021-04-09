# service-profile-switcher
A simple script that uses profiles to change windows services and desktop applications that should be running

> I may turn this into a Windows service with a UI that can be opened and an optional system tray icon

## Start and stop services based upon a profile

1. modify the listing in `service.js`
2. open command line with elevated priviledges
3. run `node .\service.js --profile <profile_name>`


## Currently supported profiles

 * developer
 * work
 * gaming
 * meeting
