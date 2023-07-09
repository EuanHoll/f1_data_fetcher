# F1 Data Fetcher

## Overview

F1 Data Fetcher is a Python application that allows users to fetch and save data related to Formula 1 races. The script is built using the `tkinter` library for its GUI and leverages the `fastf1` library to fetch the F1 data.

The fetched data includes information about a specific F1 session from a particular race and year. The user can specify the year, race number, and session type (Practice 1, Practice 2, Practice 3, Qualifying, or Race) through the GUI. The fetched data is then saved as a CSV file in the location specified by the user.

## Preview Image

![Screenshot 2023-07-09 162259](https://github.com/EuanHoll/f1_data_fetcher/assets/13416922/7a1ec7fe-5355-46ba-8f71-1e8584de3940)

## Requirements

The script requires the following Python libraries:

- `tkinter`
- `ttk`
- `filedialog`
- `messagebox`
- `fastf1`
- `datetime`
- `pandas`
- `os`

You can also easily install using poetry \
```shell
poetry install
```

and then run access the shell using the following command \

```shell
poetry shell
```

## Usage

To use the application, run the Python script. This will open a GUI where you can input:

- **Year**: The year of the race (must be a past year).
- **Race Number**: The number of the race in the year.
- **Session**: The session type (Practice 1, Practice 2, Practice 3, Qualifying, or Race).

Once you fill out these fields, click the "Get F1 Data" button. If all input fields are filled correctly, the application will fetch the requested data and prompt you to save it as a CSV file.

If an error occurs (for example, if you request data from a future year), an error message will appear.

## Notes

Please ensure you have the appropriate Python libraries installed and that the F1 data for the year and race number you request is available in the `fastf1` database.

This script uses a relative path to set the application icon. Make sure to have an icon file named "logo.ico" in the parent directory of the script file. If you want to change the logo, you can replace this file or modify the `iconbitmap` method call in the script.

## License

Please refer to the LICENSE file for details.
