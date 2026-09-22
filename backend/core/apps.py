from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "core"

    def ready(self):
        # Registers the post_delete receiver that writes tombstones. Imported
        # here rather than left to whoever imports datafeed first, because the
        # failure mode is silent: without this, deletes that happen outside a
        # request -- a management command, the sweep, a shell -- would leave no
        # trace, and a customer's warehouse would keep those rows forever
        # while every other part of the feed carried on working.
        from . import datafeed  # noqa: F401
