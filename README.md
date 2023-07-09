# F1 Data Fetcher

## Overview

F1 Data Fetcher is a Python application that enables users to fetch and save data related to Formula 1 races. The script leverages the `tkinter` library for its GUI and the `fastf1` library to fetch the F1 data.

The application retrieves data about a specific F1 session from a specified race and year. Users can input the year, race number, and session type (Practice 1, Practice 2, Practice 3, Qualifying, or Race) through the GUI. The fetched data is then saved as a CSV file in a user-specified location.

## Preview Image

![Screenshot 2023-07-09 162259](https://github.com/EuanHoll/f1_data_fetcher/assets/13416922/7a1ec7fe-5355-46ba-8f71-1e8584de3940)

## For End Users

### Installation
Download the exe from the [Latest Release](https://github.com/EuanHoll/f1_data_fetcher/releases/latest).

### Usage

To use the application, run the exe. This will open a GUI where you can input:

- **Year**: The year of the race (must be a past year).
- **Race Number**: The number of the race in the year.
- **Session**: The session type (Practice 1, Practice 2, Practice 3, Qualifying, or Race).

After filling out these fields, click the "Get F1 Data" button. If all fields are correctly filled, the application will fetch the requested data and prompt you to save it as a CSV file.

Should an error occur (for example, if you request data from a future year), an error message will be displayed.

## For Python Developers

### Requirements

The script requires the following Python libraries:

- `tkinter`
- `ttk`
- `filedialog`
- `messagebox`
- `fastf1`
- `datetime`
- `pandas`
- `os`

You can install these using Poetry:

```shell
poetry install
```

Then, access the shell with the following command:

```shell
poetry shell
```

### Usage

To use the application, run the Python script. This will open a GUI where you can input:

- **Year**: The year of the race (must be a past year).
- **Race Number**: The number of the race in the year.
- **Session**: The session type (Practice 1, Practice 2, Practice 3, Qualifying, or Race).

After filling out these fields, click the "Get F1 Data" button. If all fields are correctly filled, the application will fetch the requested data and prompt you to save it as a CSV file.

Should an error occur (for example, if you request data from a future year), an error message will be displayed.

### Notes

Ensure you have the appropriate Python libraries installed and that the F1 data for the requested year and race number is available in the `fastf1` database.

The script uses a relative path to set the application icon. Ensure there's an icon file named "logo.ico" in the parent directory of the script file. To change the logo, replace this file or modify the `iconbitmap` method call in the script.

## License

Refer to the LICENSE file for details.
