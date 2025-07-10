import asyncio
import json
import signal
import sys
from aioafero import v1

shutdown_event = asyncio.Event()

def handle_shutdown(signum, frame):
    shutdown_event.set()

# Setup signal handlers for graceful exit
signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

class HubspaceCLI:
    def __init__(self, email, password, polling_interval):
        self.bridge = v1.AferoBridgeV1(
            email,
            password,
            polling_interval=polling_interval,
            afero_client="hubspace"
        )

    async def initialize(self):
        await self.bridge.initialize()
        await asyncio.sleep(3)  # Give time for devices/switches to populate
        await self.bridge.devices.initialize()
        await self.bridge.switches.initialize()

    async def handle_command(self, command):
        cmd = command.get("command")
        devices = []

        if cmd == "list_devices":
            for d in self.bridge.switches.items:
                devices.append({
                    "id": d.id,
                    "device_id": d.id,
                    "default_name": d.device_information.default_name,
                    "name": d.device_information.name,
                    "type": d.device_information.device_class,
                    "state": {
                        "power": d.on.get(None).on if d.on.get(None) else None
                    }
                })

            # TODO: Add other types

            return devices
        elif cmd == "set_switch":
            device_id = command.get("device_id")
            new_state = command.get("state")  # Should be "on" or "off"
            device = self.bridge.devices[device_id]
            await self.bridge.switches.set_state(device.id, new_state == "on")
            return { "status": "ok" }

        elif cmd == "close":
            shutdown_event.set()
            return { "status": "closing" }

        else:
            return { "Unknown Command Error": f"Unknown command: {cmd}" }

    async def run(self):
        await self.initialize()

        while not shutdown_event.is_set():
            try:
                line = await asyncio.to_thread(sys.stdin.readline)
                if not line:
                    break

                try:
                    command = json.loads(line)
                except json.JSONDecodeError as e:
                    print(json.dumps({ "JSON Error": f"Invalid JSON: {str(e)}" }), flush=True)
                    continue

                result = await self.handle_command(command)
                print(json.dumps(result), flush=True)

            except Exception as e:
                print(json.dumps({ "Unknown Error": str(e) }), flush=True)

        await self.bridge.close()
        print(json.dumps({ "closed": True }))

# Entry point
if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == '--sanity-check':
        print(json.dumps({ "status": "ok", "message": "Hubspace CLI is responsive." }))
        sys.exit(0)

    if len(sys.argv) < 3:
        print("Usage: hubspace_cli.py <email> <password> <polling_interval>", file=sys.stderr)
        sys.exit(1)

    email = sys.argv[1]
    password = sys.argv[2]
    polling_interval = int(sys.argv[3]) if len(sys.argv) > 3 else 30

    asyncio.run(HubspaceCLI(email, password, polling_interval).run())
