def extract_functions(device):
    result = []

    # Handle power/on feature
    if hasattr(device, "on") and isinstance(device.on, dict):
        for instance, feat in device.on.items():
            result.append({
                "functionClass": feat.func_class,
                "functionInstance": instance or "default",
                "values": [{
                    "deviceValues": [{
                        "key": "on" if feat.on else "off"
                    }]
                }]
            })

    # Add support for other features later
    # if hasattr(device, "brightness"): ...
    # if hasattr(device, "color_temp"): ...
    # etc.

    return result
