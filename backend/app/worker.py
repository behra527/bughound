import logging
import time

from sqlalchemy import select

from app.db import get_session_factory
from app.models import Ticket
from app.services.workflow import run_pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("bughound.worker")


def main() -> None:
    while True:
        factory = get_session_factory()
        with factory() as db:
            ticket_id = db.scalar(
                select(Ticket.id)
                .where(Ticket.status == "queued")
                .order_by(Ticket.created_at)
                .with_for_update(skip_locked=True)
                .limit(1)
            )
            if ticket_id is not None:
                ticket = db.get(Ticket, ticket_id)
                ticket.status, ticket.stage = "queued_worker", "worker"
                db.commit()
        if ticket_id is None:
            time.sleep(2)
            continue
        try:
            run_pipeline(ticket_id)
        except Exception:
            logger.exception("Ticket %s worker task failed", ticket_id)


if __name__ == "__main__":
    main()
