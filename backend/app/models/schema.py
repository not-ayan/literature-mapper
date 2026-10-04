import datetime
from sqlalchemy import (
    Column, Integer, String, Text, Float, DateTime, ForeignKey, Index, UniqueConstraint
)
from sqlalchemy.orm import relationship
from ..core.database import Base

class Paper(Base):
    __tablename__ = "papers"

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(String(64), unique=True, index=True, nullable=False)
    title = Column(String(512), nullable=False, index=True)
    authors = Column(String(512), nullable=True)
    year = Column(Integer, nullable=True, index=True)
    doi = Column(String(128), nullable=True, index=True)
    file_path = Column(String(512), nullable=True)
    abstract = Column(Text, nullable=True)
    processing_status = Column(String(32), default="pending", index=True) # pending, processing, completed, failed
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    claims = relationship("Claim", back_populates="paper", cascade="all, delete-orphan")
    evidence_items = relationship("Evidence", back_populates="paper", cascade="all, delete-orphan")
    concepts = relationship("Concept", back_populates="paper", cascade="all, delete-orphan")
    citations_out = relationship("Citation", foreign_keys="Citation.source_paper_id", back_populates="source_paper", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Paper(paper_id='{self.paper_id}', title='{self.title[:40]}...')>"


class Claim(Base):
    __tablename__ = "claims"

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(String(64), unique=True, index=True, nullable=False)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    claim_text = Column(Text, nullable=False)
    normalized_text = Column(Text, nullable=True, index=True)
    claim_type = Column(String(64), default="finding") # finding, method, limitation, hypothesis
    confidence = Column(Float, default=1.0)
    section_location = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    paper = relationship("Paper", back_populates="claims")
    evidence_items = relationship("Evidence", back_populates="claim", cascade="all, delete-orphan")
    
    outgoing_relations = relationship(
        "ClaimRelation",
        foreign_keys="ClaimRelation.source_claim_id",
        back_populates="source_claim",
        cascade="all, delete-orphan"
    )
    incoming_relations = relationship(
        "ClaimRelation",
        foreign_keys="ClaimRelation.target_claim_id",
        back_populates="target_claim",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Claim(claim_id='{self.claim_id}', type='{self.claim_type}', conf={self.confidence})>"


class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(Integer, primary_key=True, index=True)
    evidence_id = Column(String(64), unique=True, index=True, nullable=False)
    claim_id = Column(Integer, ForeignKey("claims.id", ondelete="CASCADE"), nullable=False, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(Text, nullable=False)
    page_section = Column(String(128), nullable=True)
    extraction_confidence = Column(Float, default=1.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    claim = relationship("Claim", back_populates="evidence_items")
    paper = relationship("Paper", back_populates="evidence_items")
    relations = relationship("ClaimRelation", back_populates="evidence")

    def __repr__(self):
        return f"<Evidence(evidence_id='{self.evidence_id}', claim_id={self.claim_id})>"

